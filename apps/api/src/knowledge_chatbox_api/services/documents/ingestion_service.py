"""Document ingestion workflow with one commit per user-facing use case."""

from pathlib import Path
from time import perf_counter

from pydantic import BaseModel, ConfigDict
from sqlalchemy.orm import Session

from knowledge_chatbox_api.core.config import Settings
from knowledge_chatbox_api.core.logging import get_logger
from knowledge_chatbox_api.core.observation import (
    OPERATION_KIND_DOCUMENT_BACKGROUND_INGESTION,
    OPERATION_KIND_DOCUMENT_UPLOAD,
)
from knowledge_chatbox_api.models.auth import User
from knowledge_chatbox_api.models.document import Document, DocumentRevision
from knowledge_chatbox_api.models.enums import IndexRebuildStatus, IngestStatus
from knowledge_chatbox_api.models.settings import AppSettings
from knowledge_chatbox_api.providers.factory import (
    build_embedding_adapter,
    build_vision_adapter,
)
from knowledge_chatbox_api.repositories.document_repository import DocumentRepository
from knowledge_chatbox_api.schemas.settings import (
    ProviderRuntimeSettings,
)
from knowledge_chatbox_api.services.documents.chunking_service import get_default_chunking_service
from knowledge_chatbox_api.services.documents.constants import (
    IMAGE_DOCUMENT_FILE_TYPES,
    SUPPORTED_DOCUMENT_FILE_TYPES,
)
from knowledge_chatbox_api.services.documents.errors import (
    DocumentNotFoundError,
    DocumentNotNormalizedError,
    UnsupportedFileTypeError,
)
from knowledge_chatbox_api.services.documents.indexing_service import IndexingService
from knowledge_chatbox_api.services.documents.normalization_service import NormalizationService
from knowledge_chatbox_api.services.documents.query_service import DocumentQueryService
from knowledge_chatbox_api.services.documents.versioning_service import VersioningService
from knowledge_chatbox_api.services.settings.runtime_settings import build_runtime_settings
from knowledge_chatbox_api.services.settings.settings_service import SettingsService
from knowledge_chatbox_api.utils.chroma import get_chroma_store
from knowledge_chatbox_api.utils.document_types import (
    derive_section_title,
    guess_file_type_from_content_type,
)
from knowledge_chatbox_api.utils.files import PersistedUpload
from knowledge_chatbox_api.utils.timing import elapsed_ms, utc_now


class UploadDocumentResult(BaseModel):
    """描述一次上传结果。"""

    model_config = ConfigDict(arbitrary_types_allowed=True)

    background_processing: bool
    deduplicated: bool
    document: Document
    revision: DocumentRevision


class IndexingTarget(BaseModel):
    """描述一次索引写入的目标 generation。"""

    model_config = ConfigDict(frozen=True, arbitrary_types_allowed=True)

    generation: int
    settings: ProviderRuntimeSettings


class IngestionMetrics(BaseModel):
    """描述一次 ingestion 的阶段耗时。"""

    model_config = ConfigDict(frozen=True)

    index_latency_ms: int
    normalize_latency_ms: int

    @property
    def processing_latency_ms(self) -> int:
        return self.normalize_latency_ms + self.index_latency_ms


logger = get_logger(__name__)


class IngestionService:
    """Coordinate file save, normalization, indexing, and cleanup for documents."""

    def __init__(self, session: Session, app_settings: Settings) -> None:
        self.session = session
        self.app_settings = app_settings
        self.document_repository = DocumentRepository(session)
        self.query_service = DocumentQueryService(session)
        self.settings_service = SettingsService(session, app_settings)
        self.versioning_service = VersioningService(session, app_settings)
        self._chunking_service = get_default_chunking_service()
        self._chroma_store = get_chroma_store()
        self._normalization_service: NormalizationService | None = None

    def upload_document(
        self,
        actor: User,
        filename: str,
        upload_artifact: PersistedUpload,
        content_type: str,
    ) -> UploadDocumentResult:
        document_entity: Document | None = None
        document_version: DocumentRevision | None = None
        normalized_path: str | None = None
        indexing_targets: list[IndexingTarget] = []
        file_type: str | None = None
        ingestion_metrics: IngestionMetrics | None = None

        try:
            file_type = self._detect_file_type(filename, content_type)
            versioning_result = self.versioning_service.create_document_version(
                actor=actor,
                filename=filename,
                upload_artifact=upload_artifact,
                file_type=file_type,
            )
            document_entity = versioning_result.document
            document_version = versioning_result.version

            if versioning_result.duplicate_content:
                return self._upload_duplicate(
                    filename, file_type, upload_artifact, document_entity, document_version
                )

            document_version.lifecycle_status = IngestStatus.PROCESSING
            document_version.error_message = None
            document_version.indexed_at = None

            if file_type in IMAGE_DOCUMENT_FILE_TYPES:
                return self._upload_image(filename, file_type, document_entity, document_version)

            normalized_path, indexing_targets, ingestion_metrics = self._ingest_revision(
                document_version=document_version,
                file_type=file_type,
                use_vision=True,
            )
            self._commit_revision_indexed(document_version)
            logger.info(
                "document_upload_completed",
                filename=filename,
                file_type=file_type,
                document_id=document_entity.id,
                document_revision_id=document_version.id,
                deduplicated=False,
                background_processing=False,
                chunk_count=document_version.chunk_count,
                file_size_bytes=document_version.file_size,
                index_latency_ms=ingestion_metrics.index_latency_ms if ingestion_metrics else 0,
                normalize_latency_ms=(
                    ingestion_metrics.normalize_latency_ms if ingestion_metrics else 0
                ),
                operation_kind=OPERATION_KIND_DOCUMENT_UPLOAD,
            )
            return UploadDocumentResult(
                background_processing=False,
                deduplicated=False,
                document=document_entity,
                revision=document_version,
            )
        except Exception as exc:
            self.session.rollback()
            self._cleanup_on_failure(
                document_version,
                indexing_targets,
                normalized_path,
                upload_artifact.path,
            )
            logger.exception(
                "document_upload_failed",
                filename=filename,
                file_type=file_type,
                document_id=document_entity.id if document_entity is not None else None,
                document_revision_id=document_version.id if document_version is not None else None,
                failure_stage="upload_document",
                exception_type=type(exc).__name__,
                operation_kind=OPERATION_KIND_DOCUMENT_UPLOAD,
            )
            raise

    def _upload_duplicate(
        self,
        filename: str,
        file_type: str,
        upload_artifact: PersistedUpload,
        document_entity: Document,
        document_version: DocumentRevision,
    ) -> UploadDocumentResult:
        """处理重复内容上传：移除临时文件，返回去重结果。"""
        self._remove_file(str(upload_artifact.path))
        self.session.refresh(document_version)
        logger.info(
            "document_upload_completed",
            filename=filename,
            file_type=file_type,
            document_id=document_entity.id,
            document_revision_id=document_version.id,
            deduplicated=True,
            background_processing=False,
            operation_kind=OPERATION_KIND_DOCUMENT_UPLOAD,
        )
        return UploadDocumentResult(
            background_processing=False,
            deduplicated=True,
            document=document_entity,
            revision=document_version,
        )

    def _upload_image(
        self,
        filename: str,
        file_type: str,
        document_entity: Document,
        document_version: DocumentRevision,
    ) -> UploadDocumentResult:
        """处理图片上传：标记为 PROCESSING 并返回后台处理结果。"""
        self.session.commit()
        self.session.refresh(document_version)
        logger.info(
            "document_upload_completed",
            filename=filename,
            file_type=file_type,
            document_id=document_entity.id,
            document_revision_id=document_version.id,
            deduplicated=False,
            background_processing=True,
            operation_kind=OPERATION_KIND_DOCUMENT_UPLOAD,
        )
        return UploadDocumentResult(
            background_processing=True,
            deduplicated=False,
            document=document_entity,
            revision=document_version,
        )

    def complete_document_ingestion(self, revision_id: int) -> DocumentRevision:
        document_version = self.document_repository.get_by_id(revision_id)
        if document_version is None:
            raise DocumentNotFoundError()
        if document_version.lifecycle_status == IngestStatus.INDEXED:
            return document_version

        normalized_path: str | None = None
        indexing_targets: list[IndexingTarget] = []
        ingestion_metrics: IngestionMetrics | None = None
        processing_started_at = perf_counter()
        try:
            document_version.lifecycle_status = IngestStatus.PROCESSING
            document_version.error_message = None
            document_version.indexed_at = None
            normalized_path, indexing_targets, ingestion_metrics = self._ingest_revision(
                document_version=document_version,
                file_type=document_version.file_type,
                use_vision=True,
            )
            self._commit_revision_indexed(document_version)
            logger.info(
                "document_background_ingestion_completed",
                document_id=document_version.document_id,
                document_revision_id=document_version.id,
                background_processing_latency_ms=elapsed_ms(processing_started_at),
                chunk_count=document_version.chunk_count,
                file_type=document_version.file_type,
                file_size_bytes=document_version.file_size,
                filename=document_version.source_filename,
                index_latency_ms=ingestion_metrics.index_latency_ms if ingestion_metrics else 0,
                normalize_latency_ms=(
                    ingestion_metrics.normalize_latency_ms if ingestion_metrics else 0
                ),
                operation_kind=OPERATION_KIND_DOCUMENT_BACKGROUND_INGESTION,
            )
            return document_version
        except Exception as exc:
            self.session.rollback()
            failed_revision = self.document_repository.get_by_id(revision_id)
            if failed_revision is None:
                raise
            logger.exception(
                "document_background_ingestion_failed",
                document_revision_id=revision_id,
                file_type=document_version.file_type,
                failure_stage="background_ingestion",
                exception_type=type(exc).__name__,
                operation_kind=OPERATION_KIND_DOCUMENT_BACKGROUND_INGESTION,
            )
            self._delete_document_chunks_if_needed(
                failed_revision,
                indexing_targets,
            )
            self._commit_revision_failed(
                failed_revision,
                error_message=(
                    "Image processing failed."
                    if failed_revision.file_type in IMAGE_DOCUMENT_FILE_TYPES
                    else "Document processing failed."
                ),
            )
            if normalized_path:
                self._remove_file(normalized_path)
            self.session.refresh(failed_revision)
            return failed_revision

    def list_documents(self, actor: User) -> list[tuple[Document, DocumentRevision]]:
        return self.query_service.list_documents(actor)

    def get_document(self, actor: User, document_id: int) -> Document | None:
        return self.query_service.get_document(actor, document_id)

    def get_document_revision(self, actor: User, revision_id: int) -> DocumentRevision | None:
        return self.query_service.get_document_revision(actor, revision_id)

    def list_versions(self, actor: User, document_id: int) -> list[DocumentRevision]:
        return self.query_service.list_versions(actor, document_id)

    def reindex_document(self, actor: User, document_id: int) -> DocumentRevision:
        document = self.query_service.require_document(actor, document_id)
        document_version = self.document_repository.get_latest_revision(document)
        if document_version is None:
            raise DocumentNotFoundError()
        if document_version.normalized_path is None:
            if document_version.file_type in IMAGE_DOCUMENT_FILE_TYPES:
                return self.complete_document_ingestion(document_version.id)
            raise DocumentNotNormalizedError()
        content = Path(document_version.normalized_path).read_text(encoding="utf-8")
        settings_record = self.settings_service.get_or_create_settings_record()
        indexing_targets = self._build_indexing_targets(settings_record)
        try:
            self._index_document_for_targets(
                document_version,
                content,
                indexing_targets=indexing_targets,
            )
            self._commit_revision_indexed(document_version)
            return document_version
        except Exception:
            self.session.rollback()
            self._restore_document_indexes_from_storage(
                revision_ids=[document_version.id],
                indexing_targets=indexing_targets,
            )
            raise

    def delete_document(self, actor: User, document_id: int) -> None:
        document = self.query_service.require_document(actor, document_id)
        versions = self.document_repository.list_versions(document.id)
        version_ids = [version.id for version in versions]
        settings_record = self.settings_service.get_or_create_settings_record()
        indexing_targets = self._build_indexing_targets(settings_record)
        indexing_service = self._build_indexing_service(indexing_targets[0].settings)
        file_paths = [(version.normalized_path, version.origin_path) for version in versions]
        try:
            for version in versions:
                self._delete_document_chunks_for_targets(
                    version,
                    indexing_targets,
                    indexing_service=indexing_service,
                )
            self.session.delete(document)
            self.session.commit()
        except Exception:
            self.session.rollback()
            self._restore_document_indexes_from_storage(
                revision_ids=version_ids,
                indexing_targets=indexing_targets,
            )
            raise

        for normalized_path, origin_path in file_paths:
            if normalized_path:
                self._remove_file(normalized_path)
            self._remove_file(origin_path)

    def _get_normalization_service(self, *, use_vision: bool = True) -> NormalizationService:
        if self._normalization_service is None:
            settings_record = self.settings_service.get_or_create_settings_record()
            self._normalization_service = NormalizationService(
                normalized_dir=self.app_settings.normalized_dir,
                provider=(
                    build_vision_adapter(settings_record.vision_route) if use_vision else None
                ),
                provider_settings=settings_record,
            )
        return self._normalization_service

    def _normalize_document(
        self,
        origin_path: str,
        file_type: str,
        *,
        use_vision: bool = True,
    ):
        service = self._get_normalization_service(use_vision=use_vision)
        return service.normalize(Path(origin_path), file_type)

    def _ingest_revision(
        self,
        *,
        document_version: DocumentRevision,
        file_type: str,
        use_vision: bool,
    ) -> tuple[str, list[IndexingTarget], IngestionMetrics]:
        normalize_started_at = perf_counter()
        normalized = self._normalize_document(
            document_version.origin_path,
            file_type,
            use_vision=use_vision,
        )
        normalize_latency_ms = elapsed_ms(normalize_started_at)
        document_version.normalized_path = normalized.normalized_path
        settings_record = self.settings_service.get_or_create_settings_record()
        indexing_targets = self._build_indexing_targets(settings_record)

        index_started_at = perf_counter()
        self._index_document_for_targets(
            document_version,
            normalized.content,
            indexing_targets=indexing_targets,
        )
        index_latency_ms = elapsed_ms(index_started_at)
        return (
            normalized.normalized_path,
            indexing_targets,
            IngestionMetrics(
                index_latency_ms=index_latency_ms,
                normalize_latency_ms=normalize_latency_ms,
            ),
        )

    def _build_indexing_service(self, settings: ProviderRuntimeSettings) -> IndexingService:
        return IndexingService(
            session=self.session,
            chunking_service=self._chunking_service,
            chroma_store=self._chroma_store,
            embedding_provider=build_embedding_adapter(settings.embedding_route),
            settings=settings,
        )

    def _build_indexing_targets(self, settings_record: AppSettings) -> list[IndexingTarget]:
        targets: list[IndexingTarget] = [
            IndexingTarget(
                generation=settings_record.active_index_generation,
                settings=build_runtime_settings(settings_record),
            )
        ]
        building_generation: int | None = settings_record.building_index_generation
        if (
            settings_record.index_rebuild_status == IndexRebuildStatus.RUNNING
            and building_generation is not None
            and settings_record.pending_embedding_route is not None
        ):
            targets.append(
                IndexingTarget(
                    generation=building_generation,
                    settings=build_runtime_settings(
                        settings_record,
                        embedding_route=settings_record.pending_embedding_route,
                    ),
                )
            )
        return targets

    def _index_document_for_targets(
        self,
        document_version: DocumentRevision,
        content: str,
        *,
        indexing_targets: list[IndexingTarget],
    ) -> None:
        """为多个索引目标构建文档索引。

        注意：当前顺序执行以确保事务一致性。如有性能需求，可考虑使用 asyncio.gather 并行化。
        """
        section_title = derive_section_title(content)
        indexing_services = {
            id(target.settings): self._build_indexing_service(target.settings)
            for target in indexing_targets
        }
        for target in indexing_targets:
            indexing_services[id(target.settings)].index_document(
                document_version,
                content,
                generation=target.generation,
                section_title=section_title,
            )

    def _delete_document_chunks_for_targets(
        self,
        document_version: DocumentRevision,
        targets: list[IndexingTarget],
        *,
        indexing_service: IndexingService,
    ) -> None:
        if not targets:
            indexing_service.delete_document_chunks(document_version)
            return
        for target in targets:
            indexing_service.delete_document_chunks(
                document_version,
                generation=target.generation,
            )

    def _delete_document_chunks_if_needed(
        self,
        document_version: DocumentRevision,
        targets: list[IndexingTarget],
    ) -> None:
        if not targets:
            return
        self._delete_document_chunks_for_targets(
            document_version,
            targets,
            indexing_service=self._build_indexing_service(targets[0].settings),
        )

    def _cleanup_on_failure(
        self,
        document_version: DocumentRevision | None,
        targets: list[IndexingTarget],
        normalized_path: str | None,
        upload_path: Path | str | None,
    ) -> None:
        if document_version is not None:
            if targets:
                self._delete_document_chunks_for_targets(
                    document_version,
                    targets,
                    indexing_service=self._build_indexing_service(targets[0].settings),
                )
            self._remove_file(document_version.origin_path)
        else:
            self._remove_file(upload_path)
        if normalized_path:
            self._remove_file(normalized_path)

    def _commit_revision_indexed(self, document_version: DocumentRevision) -> None:
        document_version.lifecycle_status = IngestStatus.INDEXED
        document_version.error_message = None
        document_version.indexed_at = utc_now()
        self.session.commit()
        self.session.refresh(document_version)

    def _commit_revision_failed(
        self,
        document_version: DocumentRevision,
        *,
        error_message: str,
    ) -> None:
        document_version.normalized_path = None
        document_version.chunk_count = None
        document_version.indexed_at = None
        document_version.lifecycle_status = IngestStatus.FAILED
        document_version.error_message = error_message
        self.session.commit()

    def _restore_document_indexes_from_storage(
        self,
        *,
        revision_ids: list[int],
        indexing_targets: list[IndexingTarget],
    ) -> None:
        if not revision_ids or not indexing_targets:
            return

        try:
            for revision_id in revision_ids:
                document_version = self.document_repository.get_by_id(revision_id)
                if document_version is None or document_version.normalized_path is None:
                    continue
                content = Path(document_version.normalized_path).read_text(encoding="utf-8")
                self._index_document_for_targets(
                    document_version,
                    content,
                    indexing_targets=indexing_targets,
                )
            self.session.commit()
        except Exception:
            self.session.rollback()
            logger.exception(
                "document_index_restore_failed",
                revision_ids=revision_ids,
                operation_kind=OPERATION_KIND_DOCUMENT_BACKGROUND_INGESTION,
            )

    def _detect_file_type(self, filename: str, content_type: str) -> str:
        suffix = Path(filename).suffix.lower().lstrip(".")
        if suffix in SUPPORTED_DOCUMENT_FILE_TYPES:
            return suffix
        detected = guess_file_type_from_content_type(content_type)
        if detected is not None:
            return detected
        raise UnsupportedFileTypeError(f"Unsupported file type for upload: {filename}")

    def _remove_file(self, path: Path | str | None) -> None:
        if not path:
            return
        Path(path).unlink(missing_ok=True)
