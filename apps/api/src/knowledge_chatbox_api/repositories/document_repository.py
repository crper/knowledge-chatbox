from sqlalchemy import func, or_, select

from knowledge_chatbox_api.models.document import (
    Document,
    DocumentRevision,
    latest_revision_join_condition,
)
from knowledge_chatbox_api.models.enums import DocumentStatus, IngestStatus
from knowledge_chatbox_api.repositories.base import BaseRepository
from knowledge_chatbox_api.services.documents.constants import (
    DOCUMENT_TYPE_FILTERS,
    LISTABLE_DOCUMENT_STATUSES,
)

PENDING_LATEST_DOCUMENT_STATUSES = (IngestStatus.UPLOADED, IngestStatus.PROCESSING)


class DocumentRepository(BaseRepository[Document]):
    model_type = Document

    @staticmethod
    def _escape_like(value: str) -> str:
        return value.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")

    def add_version(self, document_version: DocumentRevision) -> DocumentRevision:
        self.session.add(document_version)
        self.session.flush()
        return document_version

    def get_by_id(self, document_id: int) -> DocumentRevision | None:
        return self.session.get(DocumentRevision, document_id)

    def list_revisions_by_ids(self, revision_ids: list[int]) -> dict[int, DocumentRevision]:
        """根据版本 ID 列表批量获取版本，返回 ID 到版本的映射。"""
        normalized_ids = sorted(set(revision_ids))
        if not normalized_ids:
            return {}

        statement = select(DocumentRevision).where(DocumentRevision.id.in_(normalized_ids))
        revisions = list(self.session.scalars(statement).all())
        return {revision.id: revision for revision in revisions}

    def get_document_for_version(self, version_id: int) -> Document | None:
        version = self.get_by_id(version_id)
        if version is None:
            return None
        return self.get_one_or_none(id=version.document_id)

    def get_latest_revision(self, document: Document) -> DocumentRevision | None:
        if document.latest_revision_id is None:
            return self.session.scalar(
                select(DocumentRevision).where(
                    DocumentRevision.document_id == document.id,
                    DocumentRevision.revision_no == document.current_version_number,
                )
            )
        return self.session.get(DocumentRevision, document.latest_revision_id)

    def list_latest(
        self,
        *,
        space_ids: set[int] | None = None,
        search_query: str | None = None,
        ingest_status: str | None = None,
        type_filter: str | None = None,
    ) -> list[tuple[Document, DocumentRevision]]:
        if space_ids is not None and not space_ids:
            return []

        statement = (
            select(Document, DocumentRevision)
            .join(
                DocumentRevision,
                latest_revision_join_condition(),
            )
            .where(
                Document.status == DocumentStatus.ACTIVE,
                DocumentRevision.ingest_status.in_(LISTABLE_DOCUMENT_STATUSES),
            )
            .order_by(Document.updated_at.desc(), Document.id.desc())
        )
        if space_ids is not None:
            statement = statement.where(Document.space_id.in_(space_ids))
        if ingest_status is not None:
            statement = statement.where(DocumentRevision.ingest_status == ingest_status)
        if type_filter is not None:
            statement = statement.where(self._build_type_filter_clause(type_filter))
        if search_query is not None:
            like_pattern = f"%{self._escape_like(search_query.lower())}%"
            statement = statement.where(
                or_(
                    Document.title.ilike(like_pattern),
                    Document.logical_name.ilike(like_pattern),
                    DocumentRevision.source_filename.ilike(like_pattern),
                    DocumentRevision.file_type.ilike(like_pattern),
                    DocumentRevision.ingest_status.ilike(like_pattern),
                )
            )
        return list(self.session.execute(statement).all())

    def _build_type_filter_clause(self, type_filter: str):
        file_types = DOCUMENT_TYPE_FILTERS.get(type_filter)
        if not file_types:
            return DocumentRevision.file_type == type_filter
        return DocumentRevision.file_type.in_(file_types)

    def get_latest_by_logical_name(
        self,
        logical_name: str,
        *,
        space_id: int,
    ) -> tuple[Document, DocumentRevision] | None:
        statement = select(Document).where(
            Document.space_id == space_id,
            Document.logical_name == logical_name,
        )
        document = self.session.scalar(statement)
        if document is None:
            return None
        version = self.get_latest_revision(document)
        if version is None:
            return None
        return document, version

    def list_versions(self, document_id: int) -> list[DocumentRevision]:
        statement = (
            select(DocumentRevision)
            .where(DocumentRevision.document_id == document_id)
            .order_by(DocumentRevision.revision_no.asc())
        )
        return list(self.session.scalars(statement).all())

    def count_latest_pending(
        self,
        *,
        space_ids: set[int] | None = None,
    ) -> int:
        if space_ids is not None and not space_ids:
            return 0

        statement = (
            select(func.count())
            .select_from(Document)
            .join(
                DocumentRevision,
                latest_revision_join_condition(),
            )
            .where(
                Document.status == DocumentStatus.ACTIVE,
                DocumentRevision.ingest_status.in_(PENDING_LATEST_DOCUMENT_STATUSES),
            )
        )
        if space_ids is not None:
            statement = statement.where(Document.space_id.in_(space_ids))
        return int(self.session.scalar(statement) or 0)

    def list_processing_documents(self) -> list[DocumentRevision]:
        statement = select(DocumentRevision).where(
            DocumentRevision.ingest_status == IngestStatus.PROCESSING
        )
        return list(self.session.scalars(statement).all())
