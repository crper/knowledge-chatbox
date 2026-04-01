"""后台索引重建服务。"""

from __future__ import annotations

from pathlib import Path

from sqlalchemy import and_, or_, select

from knowledge_chatbox_api.core.logging import get_logger
from knowledge_chatbox_api.models.document import Document, DocumentRevision
from knowledge_chatbox_api.providers.factory import build_embedding_adapter
from knowledge_chatbox_api.schemas.settings import ProviderRuntimeSettings
from knowledge_chatbox_api.services.documents.chunking_service import ChunkingService
from knowledge_chatbox_api.services.documents.constants import derive_section_title
from knowledge_chatbox_api.services.documents.indexing_service import IndexingService
from knowledge_chatbox_api.services.settings.runtime_settings import build_runtime_settings
from knowledge_chatbox_api.services.settings.settings_service import (
    INDEX_REBUILD_STATUS_IDLE,
    INDEX_REBUILD_STATUS_RUNNING,
    SettingsService,
)
from knowledge_chatbox_api.utils.chroma import get_chroma_store

logger = get_logger(__name__)


class RebuildService:
    """重建检索索引到 building generation。"""

    def __init__(self, session, settings) -> None:
        self.session = session
        self.settings = settings
        self.settings_service = SettingsService(session, settings)
        self.chunking_service = ChunkingService()
        self.chroma_store = get_chroma_store()

    def rebuild_building_generation(self, target_generation: int) -> int:
        rebuild_logger = logger.bind(target_generation=target_generation)
        settings_record = self.settings_service.get_or_create_settings_record()
        if (
            settings_record.building_index_generation != target_generation
            or settings_record.index_rebuild_status != INDEX_REBUILD_STATUS_RUNNING
        ):
            return 0

        if settings_record.pending_embedding_route is None:
            self._mark_rebuild_failed(target_generation)
            rebuild_logger.warning(
                "Index rebuild aborted because pending embedding route is missing."
            )
            return 0

        indexing_service = IndexingService(
            session=self.session,
            chunking_service=self.chunking_service,
            chroma_store=self.chroma_store,
            embedding_provider=build_embedding_adapter(settings_record.pending_embedding_route),
            settings=self._build_embedding_settings(settings_record, use_pending=True),
            default_generation=target_generation,
        )
        try:
            self.chroma_store.clear_generation(target_generation)
        except Exception:
            self._mark_rebuild_failed(target_generation)
            return 0

        errors: list[str] = []
        processed = 0
        for version in self._list_indexable_versions():
            if not version.normalized_path:
                errors.append(f"version:{version.id}:missing_normalized_path")
                continue
            try:
                content = Path(version.normalized_path).read_text(encoding="utf-8")
                indexing_service.index_document(
                    version,
                    content,
                    generation=target_generation,
                    section_title=derive_section_title(content),
                )
                self.session.commit()
                processed += 1
            except Exception:  # noqa: BLE001
                self.session.rollback()
                errors.append(f"version:{version.id}:rebuild_failed")

        latest_settings = self.settings_service.get_or_create_settings_record()
        self.session.refresh(latest_settings)
        if latest_settings.building_index_generation != target_generation:
            return processed

        if errors:
            latest_settings.index_rebuild_status = "failed"
            self.session.commit()
            return processed

        if latest_settings.pending_embedding_route is None:
            latest_settings.index_rebuild_status = "failed"
            self.session.commit()
            return processed

        pending_embedding_route_json = latest_settings.pending_embedding_route_json
        if pending_embedding_route_json is None:
            latest_settings.index_rebuild_status = "failed"
            self.session.commit()
            return processed

        latest_settings.embedding_route_json = pending_embedding_route_json
        latest_settings.pending_embedding_route_json = None
        latest_settings.active_index_generation = target_generation
        latest_settings.building_index_generation = None
        latest_settings.index_rebuild_status = INDEX_REBUILD_STATUS_IDLE
        self.session.commit()
        return processed

    def _list_indexable_versions(self) -> list[DocumentRevision]:
        statement = (
            select(DocumentRevision)
            .join(Document, Document.id == DocumentRevision.document_id)
            .where(
                Document.status == "active",
                or_(
                    Document.latest_revision_id == DocumentRevision.id,
                    and_(
                        Document.latest_revision_id.is_(None),
                        DocumentRevision.revision_no == Document.current_version_number,
                    ),
                ),
                DocumentRevision.lifecycle_status == "indexed",
            )
            .order_by(Document.updated_at.desc(), Document.id.desc())
        )
        return list(self.session.scalars(statement).all())

    def _build_embedding_settings(
        self,
        settings_record,
        *,
        use_pending: bool,
    ) -> ProviderRuntimeSettings:
        return build_runtime_settings(
            settings_record,
            embedding_route=(
                settings_record.pending_embedding_route
                if use_pending
                else settings_record.embedding_route
            ),
        )

    def _mark_rebuild_failed(self, target_generation: int) -> None:
        latest_settings = self.settings_service.get_or_create_settings_record()
        self.session.refresh(latest_settings)
        if (
            latest_settings.building_index_generation == target_generation
            and latest_settings.index_rebuild_status == INDEX_REBUILD_STATUS_RUNNING
        ):
            latest_settings.index_rebuild_status = "failed"
            self.session.commit()
