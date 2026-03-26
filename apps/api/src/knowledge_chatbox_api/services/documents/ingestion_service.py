"""Document ingestion workflow with one commit per user-facing use case."""

from __future__ import annotations

from dataclasses import dataclass
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

from knowledge_chatbox_api.core.logging import get_logger
from knowledge_chatbox_api.models.document import Document, DocumentRevision
from knowledge_chatbox_api.providers.factory import (
    build_embedding_adapter,
    build_vision_adapter_from_settings,
)
from knowledge_chatbox_api.repositories.document_repository import DocumentRepository
from knowledge_chatbox_api.schemas.settings import (
    ProviderRuntimeSettings,
    build_provider_runtime_settings,
)
from knowledge_chatbox_api.services.documents.chunking_service import ChunkingService
from knowledge_chatbox_api.services.documents.constants import (
    CONTENT_TYPE_TO_FILE_TYPE,
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
from knowledge_chatbox_api.services.settings.settings_service import (
    INDEX_REBUILD_STATUS_RUNNING,
    SettingsService,
)
from knowledge_chatbox_api.utils.chroma import get_chroma_store
from knowledge_chatbox_api.utils.files import PersistedUpload


@dataclass
class UploadDocumentResult:
    """Describe one upload outcome for the API layer."""

    background_processing: bool
    deduplicated: bool
    document: Document
    revision: DocumentRevision


@dataclass(frozen=True)
class IndexingTarget:
    """描述一次索引写入的目标 generation。"""

    generation: int
    settings: ProviderRuntimeSettings


class IngestionService:
    """Coordinate file save, normalization, indexing, and cleanup for documents."""

    def __init__(self, session, app_settings) -> None:
        self.session = session
        self.app_settings = app_settings
        self.document_repository = DocumentRepository(session)
        self.query_service = DocumentQueryService(session)
        self.settings_service = SettingsService(session, app_settings)
        self.versioning_service = VersioningService(session, app_settings)
        self._chunking_service = ChunkingService()
        self._chroma_store = get_chroma_store()
        self._indexing_service: IndexingService | None = None

    logger = get_logger(__name__)

    def upload_document(
        self,
        actor,
        filename: str,
        upload_artifact: PersistedUpload,
        content_type: str,
    ) -> UploadDocumentResult:
        document_entity: Document | None = None
        document_version: DocumentRevision | None = None
        normalized_path: str | None = None
        indexing_targets: list[IndexingTarget] = []
        file_type: str | None = None

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
                self._remove_file(str(upload_artifact.path))
                self.session.refresh(document_version)
                self.logger.info(
                    "document_upload_completed",
                    filename=filename,
                    file_type=file_type,
                    document_id=document_entity.id,
                    document_revision_id=document_version.id,
                    deduplicated=True,
                    background_processing=False,
                )
                return UploadDocumentResult(
                    background_processing=False,
                    deduplicated=True,
                    document=document_entity,
                    revision=document_version,
                )
            document_version.lifecycle_status = "processing"
            document_version.error_message = None
            document_version.indexed_at = None

            if file_type in IMAGE_DOCUMENT_FILE_TYPES:
                self.session.commit()
                self.session.refresh(document_version)
                self.logger.info(
                    "document_upload_completed",
                    filename=filename,
                    file_type=file_type,
                    document_id=document_entity.id,
                    document_revision_id=document_version.id,
                    deduplicated=False,
                    background_processing=True,
                )
                return UploadDocumentResult(
                    background_processing=True,
                    deduplicated=False,
                    document=document_entity,
                    revision=document_version,
                )

            normalized_path, indexing_targets = self._ingest_revision(
                document_version=document_version,
                file_type=file_type,
                use_vision=True,
            )
            self.session.commit()
            self.session.refresh(document_version)
            self.logger.info(
                "document_upload_completed",
                filename=filename,
                file_type=file_type,
                document_id=document_entity.id,
                document_revision_id=document_version.id,
                deduplicated=False,
                background_processing=False,
            )
            return UploadDocumentResult(
                background_processing=False,
                deduplicated=False,
                document=document_entity,
                revision=document_version,
            )
        except Exception as exc:  # noqa: BLE001
            self.session.rollback()
            if document_version is not None:
                if indexing_targets:
                    self._delete_document_chunks_for_targets(
                        document_version,
                        indexing_targets,
                        indexing_service=self._get_indexing_service(indexing_targets[0].settings),
                    )
                self._remove_file(document_version.origin_path)
            else:
                self._remove_file(str(upload_artifact.path))
            if normalized_path:
                self._remove_file(normalized_path)
            self.logger.exception(
                "document_upload_failed",
                filename=filename,
                file_type=file_type,
                document_id=document_entity.id if document_entity is not None else None,
                document_revision_id=document_version.id if document_version is not None else None,
                failure_stage="upload_document",
                exception_type=type(exc).__name__,
            )
            raise

    def complete_document_ingestion(self, revision_id: int) -> DocumentRevision:
        document_version = self.document_repository.get_by_id(revision_id)
        if document_version is None:
            raise DocumentNotFoundError()
        if document_version.lifecycle_status == "indexed":
            return document_version

        normalized_path: str | None = None
        indexing_targets: list[IndexingTarget] = []
        try:
            document_version.lifecycle_status = "processing"
            document_version.error_message = None
            document_version.indexed_at = None
            normalized_path, indexing_targets = self._ingest_revision(
                document_version=document_version,
                file_type=document_version.file_type,
                use_vision=True,
            )
            self.session.commit()
            self.session.refresh(document_version)
            self.logger.info(
                "document_background_ingestion_completed",
                document_revision_id=document_version.id,
                file_type=document_version.file_type,
            )
            return document_version
        except Exception as exc:  # noqa: BLE001
            self.session.rollback()
            failed_revision = self.document_repository.get_by_id(revision_id)
            if failed_revision is None:
                raise
            self.logger.exception(
                "document_background_ingestion_failed",
                document_revision_id=revision_id,
                file_type=document_version.file_type,
                failure_stage="background_ingestion",
                exception_type=type(exc).__name__,
            )
            if indexing_targets:
                self._delete_document_chunks_for_targets(
                    failed_revision,
                    indexing_targets,
                    indexing_service=self._get_indexing_service(indexing_targets[0].settings),
                )
            failed_revision.normalized_path = None
            failed_revision.chunk_count = None
            failed_revision.indexed_at = None
            failed_revision.lifecycle_status = "failed"
            failed_revision.error_message = self._background_ingestion_error_message(
                failed_revision.file_type
            )
            self.session.commit()
            if normalized_path:
                self._remove_file(normalized_path)
            self.session.refresh(failed_revision)
            return failed_revision

    def list_documents(self, actor) -> list[tuple[Document, DocumentRevision]]:
        return self.query_service.list_documents(actor)

    def get_document(self, actor, document_id: int) -> Document | None:
        return self.query_service.get_document(actor, document_id)

    def get_document_revision(self, actor, revision_id: int) -> DocumentRevision | None:
        return self.query_service.get_document_revision(actor, revision_id)

    def list_versions(self, actor, document_id: int) -> list[DocumentRevision]:
        return self.query_service.list_versions(actor, document_id)

    def reindex_document(self, actor, document_id: int) -> DocumentRevision:
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
        indexing_service = self._get_indexing_service(settings_record)
        snapshots = self._snapshot_document_chunks(
            document_version,
            indexing_targets,
            indexing_service=indexing_service,
        )
        try:
            for target in indexing_targets:
                self._get_indexing_service(target.settings).index_document(
                    document_version,
                    content,
                    generation=target.generation,
                    section_title=self._derive_section_title(content),
                )
            document_version.lifecycle_status = "indexed"
            document_version.error_message = None
            document_version.indexed_at = datetime.now(UTC)
            self.session.commit()
            self.session.refresh(document_version)
            return document_version
        except Exception:  # noqa: BLE001
            self.session.rollback()
            self._restore_document_chunks(
                document_version,
                indexing_targets,
                snapshots,
                indexing_service=indexing_service,
            )
            raise

    def delete_document(self, actor, document_id: int) -> None:
        document = self.query_service.require_document(actor, document_id)
        versions = self.document_repository.list_versions(document.id)
        settings_record = self.settings_service.get_or_create_settings_record()
        indexing_targets = self._build_indexing_targets(settings_record)
        indexing_service = self._get_indexing_service(settings_record)
        snapshots = self._snapshot_versions_chunks(
            versions,
            indexing_targets,
            indexing_service=indexing_service,
        )
        file_paths = [(version.normalized_path, version.origin_path) for version in versions]
        try:
            for version in versions:
                self._delete_document_chunks_for_targets(
                    version,
                    indexing_targets,
                    indexing_service=indexing_service,
                )
            self.document_repository.delete(document)
            self.session.commit()
        except Exception:  # noqa: BLE001
            self.session.rollback()
            self._restore_versions_chunks(
                versions,
                indexing_targets,
                snapshots,
                indexing_service=indexing_service,
            )
            raise

        for normalized_path, origin_path in file_paths:
            if normalized_path:
                self._remove_file(normalized_path)
            self._remove_file(origin_path)

    def _normalize_document(
        self,
        origin_path: str,
        file_type: str,
        *,
        use_vision: bool = True,
    ):
        settings_record = self.settings_service.get_or_create_settings_record()
        service = NormalizationService(
            normalized_dir=self.app_settings.normalized_dir,
            provider=build_vision_adapter_from_settings(settings_record) if use_vision else None,
            provider_settings=settings_record,
        )
        return service.normalize(Path(origin_path), file_type)

    def _background_ingestion_error_message(self, file_type: str) -> str:
        if file_type in IMAGE_DOCUMENT_FILE_TYPES:
            return "Image processing failed."
        return "Document processing failed."

    def _ingest_revision(
        self,
        *,
        document_version: DocumentRevision,
        file_type: str,
        use_vision: bool,
    ) -> tuple[str, list[IndexingTarget]]:
        normalized = self._normalize_document(
            document_version.origin_path,
            file_type,
            use_vision=use_vision,
        )
        document_version.normalized_path = normalized.normalized_path
        settings_record = self.settings_service.get_or_create_settings_record()
        indexing_targets = self._build_indexing_targets(settings_record)
        for target in indexing_targets:
            self._get_indexing_service(target.settings).index_document(
                document_version,
                normalized.content,
                generation=target.generation,
                section_title=self._derive_section_title(normalized.content),
            )
        document_version.lifecycle_status = "indexed"
        document_version.error_message = None
        document_version.indexed_at = datetime.now(UTC)
        return normalized.normalized_path, indexing_targets

    def _get_indexing_service(self, settings_record) -> IndexingService:
        indexing_service = self._indexing_service
        if indexing_service is None:
            indexing_service = IndexingService(
                session=self.session,
                chunking_service=self._chunking_service,
                chroma_store=self._chroma_store,
                embedding_provider=build_embedding_adapter(settings_record.embedding_route),
                settings=settings_record,
            )
            self._indexing_service = indexing_service
            return indexing_service

        indexing_service.embedding_provider = build_embedding_adapter(
            settings_record.embedding_route
        )
        indexing_service.settings = settings_record
        return indexing_service

    def _build_indexing_targets(self, settings_record) -> list[IndexingTarget]:
        targets = [
            IndexingTarget(
                generation=settings_record.active_index_generation,
                settings=self._build_embedding_settings(settings_record, use_pending=False),
            )
        ]
        building_generation = getattr(settings_record, "building_index_generation", None)
        if (
            getattr(settings_record, "index_rebuild_status", None) == INDEX_REBUILD_STATUS_RUNNING
            and building_generation is not None
            and getattr(settings_record, "pending_embedding_route", None) is not None
        ):
            targets.append(
                IndexingTarget(
                    generation=building_generation,
                    settings=self._build_embedding_settings(settings_record, use_pending=True),
                )
            )
        return targets

    def _build_embedding_settings(
        self,
        settings_record,
        *,
        use_pending: bool,
    ) -> ProviderRuntimeSettings:
        return build_provider_runtime_settings(
            settings_record,
            embedding_route=(
                settings_record.pending_embedding_route
                if use_pending
                else settings_record.embedding_route
            ),
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

    def _snapshot_document_chunks(
        self,
        document_version: DocumentRevision,
        targets: list[IndexingTarget],
        *,
        indexing_service: IndexingService,
    ) -> dict[int, list[dict[str, Any]]]:
        snapshots: dict[int, list[dict[str, Any]]] = {}
        for target in targets:
            generation = target.generation
            snapshots[generation] = indexing_service.chroma_store.list_by_document_id(
                document_version.id,
                generation=generation,
            )
        return snapshots

    def _snapshot_versions_chunks(
        self,
        versions: list[DocumentRevision],
        targets: list[IndexingTarget],
        *,
        indexing_service: IndexingService,
    ) -> dict[int, dict[int, list[dict[str, Any]]]]:
        return {
            version.id: self._snapshot_document_chunks(
                version,
                targets,
                indexing_service=indexing_service,
            )
            for version in versions
        }

    def _restore_document_chunks(
        self,
        document_version: DocumentRevision,
        targets: list[IndexingTarget],
        snapshots: dict[int, list[dict[str, Any]]],
        *,
        indexing_service: IndexingService,
    ) -> None:
        for target in targets:
            generation = target.generation
            records = snapshots.get(generation, [])
            indexing_service.chroma_store.delete_by_document_id(
                document_version.id,
                generation=generation,
            )
            if not records:
                continue
            indexing_service.chroma_store.upsert(
                records,
                embeddings=[record["embedding"] for record in records],
                generation=generation,
            )

    def _restore_versions_chunks(
        self,
        versions: list[DocumentRevision],
        targets: list[IndexingTarget],
        snapshots: dict[int, dict[int, list[dict[str, Any]]]],
        *,
        indexing_service: IndexingService,
    ) -> None:
        for version in versions:
            self._restore_document_chunks(
                version,
                targets,
                snapshots.get(version.id, {}),
                indexing_service=indexing_service,
            )

    def _detect_file_type(self, filename: str, content_type: str) -> str:
        suffix = Path(filename).suffix.lower().lstrip(".")
        if suffix in SUPPORTED_DOCUMENT_FILE_TYPES:
            return suffix
        detected = CONTENT_TYPE_TO_FILE_TYPE.get(content_type)
        if detected is not None:
            return detected
        raise UnsupportedFileTypeError(f"Unsupported file type for upload: {filename}")

    def _remove_file(self, path: str | None) -> None:
        if not path:
            return
        file_path = Path(path)
        if file_path.exists():
            file_path.unlink()

    def _derive_section_title(self, content: str) -> str | None:
        for line in content.splitlines():
            stripped = line.strip()
            if not stripped:
                continue
            if stripped.startswith("#"):
                return stripped.lstrip("#").strip() or None
            return stripped[:120]
        return None
