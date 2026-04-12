from typing import TYPE_CHECKING, Any

from sqlalchemy import select
from sqlalchemy.orm import Session

from knowledge_chatbox_api.core.logging import get_logger
from knowledge_chatbox_api.models.document import (
    Document,
    DocumentRevision,
    latest_revision_join_condition,
)
from knowledge_chatbox_api.models.enums import DocumentStatus, IngestStatus
from knowledge_chatbox_api.providers.base import BaseEmbeddingAdapter
from knowledge_chatbox_api.schemas.settings import ProviderRuntimeSettings
from knowledge_chatbox_api.services.chat.retrieval.models import MIN_RETRIEVAL_SOURCE_SCORE
from knowledge_chatbox_api.services.chat.retrieval.policy import (
    attachment_scoped_top_k,
    select_attachment_scoped_records,
)
from knowledge_chatbox_api.utils.chroma import ChunkStore
from knowledge_chatbox_api.utils.text_matching import (
    has_text_overlap,
)

if TYPE_CHECKING:
    from knowledge_chatbox_api.repositories.retrieval_chunk_repository import (
        RetrievalChunkRepository,
    )

logger = get_logger(__name__)


class RetrievalQueryEngine:
    def __init__(
        self,
        *,
        session: Session,
        chroma_store: ChunkStore,
        embedding_adapter: BaseEmbeddingAdapter,
        settings: ProviderRuntimeSettings,
        retrieval_chunk_repository: "RetrievalChunkRepository",
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
                Document.status == DocumentStatus.ACTIVE,
                latest_revision_join_condition(),
                DocumentRevision.ingest_status == IngestStatus.INDEXED,
            )
            .limit(1)
        )
        result = self.session.execute(select(exists_query.exists())).scalar()
        return bool(result)

    def embed_query_or_none(self, query_text: str) -> list[float] | None:
        try:
            embeddings = self.embedding_adapter.embed([query_text], self.settings)
        except Exception as exc:
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

    def is_relevant_retrieval_hit(
        self,
        record: dict[str, Any],
        query_text: str,
        *,
        query_normalized: str | None = None,
        query_tokens: set[str] | None = None,
        query_quoted_phrases: list[str] | None = None,
    ) -> bool:
        score = float(record.get("score", 0.0))
        if score >= MIN_RETRIEVAL_SOURCE_SCORE:
            return True
        return self._has_query_overlap(
            record,
            query_text,
            query_normalized=query_normalized,
            query_tokens=query_tokens,
            query_quoted_phrases=query_quoted_phrases,
        )

    def _has_query_overlap(
        self,
        record: dict[str, Any],
        query_text: str,
        *,
        query_normalized: str | None = None,
        query_tokens: set[str] | None = None,
        query_quoted_phrases: list[str] | None = None,
    ) -> bool:
        resolved_phrases = set(query_quoted_phrases) if query_quoted_phrases is not None else None
        section_title = record.get("metadata", {}).get("section_title") or ""
        haystack = f"{record.get('text', '')} {section_title}"
        return has_text_overlap(
            query_text,
            haystack,
            query_normalized=query_normalized,
            query_tokens=query_tokens,
            query_quoted_phrases=resolved_phrases,
        )
