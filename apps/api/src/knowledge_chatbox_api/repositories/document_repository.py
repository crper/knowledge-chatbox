"""文档仓储数据访问实现。"""

from __future__ import annotations

from sqlalchemy import and_, or_, select
from sqlalchemy.engine import Row
from sqlalchemy.orm import Session

from knowledge_chatbox_api.models.document import Document, DocumentRevision
from knowledge_chatbox_api.services.documents.constants import LISTABLE_DOCUMENT_STATUSES


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

    def get_document_entity(self, document_id: int) -> Document | None:
        """获取文档Entity。"""
        return self.session.get(Document, document_id)

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
    ) -> list[tuple[Document, DocumentRevision]]:
        """列出逻辑文档和最新修订。"""
        if space_ids is not None and not space_ids:
            return []

        statement = (
            select(Document, DocumentRevision)
            .join(
                DocumentRevision,
                or_(
                    DocumentRevision.id == Document.latest_revision_id,
                    and_(
                        Document.latest_revision_id.is_(None),
                        DocumentRevision.document_id == Document.id,
                        DocumentRevision.revision_no == Document.current_version_number,
                    ),
                ),
            )
            .where(
                Document.status == "active",
                DocumentRevision.ingest_status.in_(LISTABLE_DOCUMENT_STATUSES),
            )
            .order_by(Document.updated_at.desc(), Document.id.desc())
        )
        if space_ids is not None:
            statement = statement.where(Document.space_id.in_(space_ids))
        rows: list[Row[tuple[Document, DocumentRevision]]] = list(
            self.session.execute(statement).all()
        )
        return [(document, revision) for document, revision in rows]

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

    def list_processing_documents(self) -> list[DocumentRevision]:
        """列出Processing文档。"""
        statement = select(DocumentRevision).where(DocumentRevision.ingest_status == "processing")
        return list(self.session.scalars(statement).all())

    def delete(self, document: Document) -> None:
        """删除Delete。"""
        self.session.delete(document)
