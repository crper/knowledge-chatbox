from __future__ import annotations

from typing import Any

from sqlalchemy import and_, or_, select

from knowledge_chatbox_api.core.logging import get_logger
from knowledge_chatbox_api.models.document import Document, DocumentRevision
from knowledge_chatbox_api.services.chat.retrieval.models import MIN_RETRIEVAL_SOURCE_SCORE
from knowledge_chatbox_api.services.chat.retrieval.policy import (
    attachment_scoped_top_k,
    select_attachment_scoped_records,
)
from knowledge_chatbox_api.utils.chroma import (
    _normalize_match_text,
    _quoted_phrases,
    _tokenize_text,
)

logger = get_logger(__name__)


class RetrievalQueryEngine:
    def __init__(
        self,
        *,
        session,
        chroma_store,
        embedding_adapter,
        settings,
        retrieval_chunk_repository,
    ) -> None:
        self.session = session
        self.chroma_store = chroma_store
        self.embedding_adapter = embedding_adapter
        self.settings = settings
        self.retrieval_chunk_repository = retrieval_chunk_repository

    def has_retrievable_documents(self, space_id: int | None) -> bool:
        if space_id is None:
            return False

        exists_query = (
            select(1)
            .select_from(DocumentRevision)
            .join(Document, Document.id == DocumentRevision.document_id)
            .where(
                Document.space_id == space_id,
                Document.status == "active",
                or_(
                    Document.latest_revision_id == DocumentRevision.id,
                    and_(
                        Document.latest_revision_id.is_(None),
                        DocumentRevision.revision_no == Document.current_version_number,
                    ),
                ),
                DocumentRevision.ingest_status == "indexed",
            )
            .limit(1)
        )
        result = self.session.execute(select(exists_query.exists())).scalar()
        return bool(result)

    def embed_query_or_none(self, query_text: str) -> list[float] | None:
        try:
            embeddings = self.embedding_adapter.embed([query_text], self.settings)
        except Exception as exc:  # noqa: BLE001
            logger.warning(
                "Retrieval degraded because query embedding generation failed",
                exception_type=type(exc).__name__,
                query_length=len(query_text),
            )
            return None
        return embeddings[0] if embeddings else None

    def query_retrieved_chunks(
        self,
        query_text: str,
        *,
        active_space_id: int | None,
        attachment_revision_ids: list[int],
        generation: int,
        query_embedding: list[float] | None,
        where_filter: dict[str, Any] | None,
    ) -> list[dict[str, Any]]:
        if len(attachment_revision_ids) <= 1:
            return self.chroma_store.query(
                query_text,
                query_embedding=query_embedding,
                top_k=3,
                generation=generation,
                where=where_filter,
            )

        records = self.chroma_store.query(
            query_text,
            query_embedding=query_embedding,
            top_k=attachment_scoped_top_k(attachment_revision_ids),
            generation=generation,
            where=where_filter,
        )
        return select_attachment_scoped_records(records, attachment_revision_ids)

    def query_lexical_chunks(
        self,
        query_text: str,
        *,
        active_space_id: int | None,
        attachment_revision_ids: list[int],
        generation: int,
    ) -> list[dict[str, Any]]:
        if len(attachment_revision_ids) <= 1:
            return self.retrieval_chunk_repository.query(
                query_text,
                generation=generation,
                top_k=3,
                space_id=active_space_id,
                document_revision_ids=attachment_revision_ids or None,
            )

        records = self.retrieval_chunk_repository.query(
            query_text,
            generation=generation,
            top_k=attachment_scoped_top_k(attachment_revision_ids),
            space_id=active_space_id,
            document_revision_ids=attachment_revision_ids,
        )
        return select_attachment_scoped_records(records, attachment_revision_ids)

    def is_relevant_retrieval_hit(self, record: dict[str, Any], query_text: str) -> bool:
        score = float(record.get("score", 0.0))
        if score >= MIN_RETRIEVAL_SOURCE_SCORE:
            return True
        return self._has_query_overlap(record, query_text)

    def _has_query_overlap(self, record: dict[str, Any], query_text: str) -> bool:
        query_terms = _tokenize_text(query_text)
        if not query_terms:
            return False

        section_title = record.get("metadata", {}).get("section_title") or ""
        haystack = f"{record.get('text', '')} {section_title}"
        normalized_haystack = _normalize_match_text(haystack)
        normalized_query = _normalize_match_text(query_text)

        query_phrases = _quoted_phrases(query_text)
        if any(phrase in normalized_haystack for phrase in query_phrases):
            return True

        if len(normalized_query) >= 2 and normalized_query in normalized_haystack:
            return True

        haystack_tokens = _tokenize_text(haystack)
        return len(query_terms & haystack_tokens) > 0
