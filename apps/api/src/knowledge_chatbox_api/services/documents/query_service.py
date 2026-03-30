"""Lightweight document read service for list/detail/file access paths."""

from __future__ import annotations

from knowledge_chatbox_api.models.document import Document, DocumentRevision
from knowledge_chatbox_api.repositories.document_repository import DocumentRepository
from knowledge_chatbox_api.repositories.space_repository import SpaceRepository
from knowledge_chatbox_api.services.documents.errors import DocumentNotFoundError


class DocumentQueryService:
    """Handle document reads without constructing indexing or provider dependencies."""

    def __init__(self, session) -> None:
        self.session = session
        self.document_repository = DocumentRepository(session)
        self.space_repository = SpaceRepository(session)

    def list_documents(
        self,
        actor,
        *,
        ingest_status: str | None = None,
        query: str | None = None,
        type_filter: str | None = None,
    ) -> list[tuple[Document, DocumentRevision]]:
        normalized_query = (
            query.strip().lower() if isinstance(query, str) and query.strip() else None
        )
        return self.document_repository.list_latest(
            space_ids=self._visible_space_ids(actor.id),
            search_query=normalized_query,
            ingest_status=ingest_status,
            type_filter=type_filter,
        )

    def get_document(self, actor, document_id: int) -> Document | None:
        document = self.document_repository.get_document_entity(document_id)
        if document is None:
            return None
        if not self._can_access_document(actor.id, document):
            return None
        return document

    def get_document_revision(self, actor, revision_id: int) -> DocumentRevision | None:
        document_revision = self.document_repository.get_by_id(revision_id)
        if document_revision is None:
            return None
        document = self.document_repository.get_document_entity(document_revision.document_id)
        if document is None or not self._can_access_document(actor.id, document):
            return None
        return document_revision

    def list_versions(self, actor, document_id: int) -> list[DocumentRevision]:
        document = self.require_document(actor, document_id)
        return self.document_repository.list_versions(document.id)

    def require_document(self, actor, document_id: int) -> Document:
        document = self.get_document(actor, document_id)
        if document is None:
            raise DocumentNotFoundError()
        return document

    def _visible_space_ids(self, user_id: int) -> set[int]:
        return set(self.space_repository.get_visible_space_ids_for_user(user_id))

    def _can_access_document(self, user_id: int, document: Document) -> bool:
        return document.space_id in self._visible_space_ids(user_id)
