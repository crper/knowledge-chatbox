"""文档仓储数据访问实现。"""

from sqlalchemy import func, or_, select
from sqlalchemy.engine import Row
from sqlalchemy.orm import Session

from knowledge_chatbox_api.models.document import (
    Document,
    DocumentRevision,
    latest_revision_join_condition,
)
from knowledge_chatbox_api.models.enums import DocumentStatus, IngestStatus
from knowledge_chatbox_api.services.documents.constants import (
    DOCX_DOCUMENT_FILE_TYPES,
    IMAGE_DOCUMENT_FILE_TYPES,
    LISTABLE_DOCUMENT_STATUSES,
    MARKDOWN_DOCUMENT_FILE_TYPES,
    TEXT_DOCUMENT_FILE_TYPES,
)

DOCUMENT_TYPE_FILTERS = {
    "document": tuple(DOCX_DOCUMENT_FILE_TYPES),
    "image": tuple(IMAGE_DOCUMENT_FILE_TYPES),
    "markdown": tuple(MARKDOWN_DOCUMENT_FILE_TYPES),
    "pdf": ("pdf",),
    "text": tuple(TEXT_DOCUMENT_FILE_TYPES),
}
PENDING_LATEST_DOCUMENT_STATUSES = (IngestStatus.UPLOADED, IngestStatus.PROCESSING)


class DocumentRepository:
    """封装文档与版本数据访问。"""

    def __init__(self, session: Session) -> None:
        self.session = session

    def add(self, document: Document) -> Document:
        """处理Add相关逻辑。"""
        self.session.add(document)
        self.session.flush()
        return document

    def add_version(self, document_version: DocumentRevision) -> DocumentRevision:
        """处理Add版本相关逻辑。"""
        self.session.add(document_version)
        self.session.flush()
        return document_version

    def get_by_id(self, document_id: int) -> DocumentRevision | None:
        """获取ById。"""
        return self.session.get(DocumentRevision, document_id)

    def list_revisions_by_ids(self, revision_ids: list[int]) -> dict[int, DocumentRevision]:
        """批量获取指定修订。"""
        normalized_ids = sorted(set(revision_ids))
        if not normalized_ids:
            return {}

        statement = select(DocumentRevision).where(DocumentRevision.id.in_(normalized_ids))
        revisions = list(self.session.scalars(statement).all())
        return {revision.id: revision for revision in revisions}

    def get_document_entity(self, document_id: int) -> Document | None:
        """获取文档Entity。"""
        return self.session.get(Document, document_id)

    def list_documents_by_ids(self, document_ids: list[int]) -> dict[int, Document]:
        """批量获取指定文档实体。"""
        normalized_ids = sorted(set(document_ids))
        if not normalized_ids:
            return {}

        statement = select(Document).where(Document.id.in_(normalized_ids))
        documents = list(self.session.scalars(statement).all())
        return {document.id: document for document in documents}

    def get_document_for_version(self, version_id: int) -> Document | None:
        """获取文档For版本。"""
        version = self.get_by_id(version_id)
        if version is None:
            return None
        return self.get_document_entity(version.document_id)

    def get_latest_revision(self, document: Document) -> DocumentRevision | None:
        """获取当前最新修订。"""
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
        """列出逻辑文档和最新修订。"""
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
            like_pattern = f"%{search_query.lower()}%"
            statement = statement.where(
                or_(
                    Document.title.ilike(like_pattern),
                    Document.logical_name.ilike(like_pattern),
                    DocumentRevision.source_filename.ilike(like_pattern),
                    DocumentRevision.file_type.ilike(like_pattern),
                    DocumentRevision.ingest_status.ilike(like_pattern),
                )
            )
        rows: list[Row[tuple[Document, DocumentRevision]]] = list(
            self.session.execute(statement).all()
        )
        return [(document, revision) for document, revision in rows]

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
        """获取LatestByLogicalName。"""
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
        """列出Versions。"""
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
        """统计当前可见逻辑文档里最新修订仍在 pending 的数量。"""
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
        """列出Processing文档。"""
        statement = select(DocumentRevision).where(
            DocumentRevision.ingest_status == IngestStatus.PROCESSING
        )
        return list(self.session.scalars(statement).all())

    def delete(self, document: Document) -> None:
        """删除Delete。"""
        self.session.delete(document)
