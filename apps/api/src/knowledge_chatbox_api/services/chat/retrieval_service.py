"""Knowledge retrieval helpers used by chat prompt assembly."""

from time import perf_counter
from typing import Any

from knowledge_chatbox_api.repositories.retrieval_chunk_repository import RetrievalChunkRepository
from knowledge_chatbox_api.services.chat.retrieval.context_builder import RetrievedContextBuilder
from knowledge_chatbox_api.services.chat.retrieval.models import RetrievedContext
from knowledge_chatbox_api.services.chat.retrieval.policy import (
    build_retrieval_where_filter,
    collect_attachment_revision_ids,
    should_retrieve_knowledge,
)
from knowledge_chatbox_api.services.chat.retrieval.querying import RetrievalQueryEngine
from knowledge_chatbox_api.utils.text_matching import (
    normalize_and_tokenize,
    quoted_phrases,
)


class RetrievalService:
    """Encapsulate retrieval eligibility, execution, and source shaping."""

    def __init__(
        self,
        *,
        session,
        chroma_store,
        embedding_adapter,
        settings,
    ) -> None:
        self.settings = settings
        self.context_builder = RetrievedContextBuilder(session=session)
        self.query_engine = RetrievalQueryEngine(
            session=session,
            chroma_store=chroma_store,
            embedding_adapter=embedding_adapter,
            settings=settings,
            retrieval_chunk_repository=RetrievalChunkRepository(session),
        )

    def retrieve_context(
        self,
        query_text: str,
        *,
        active_space_id: int | None,
        attachments: list[dict[str, Any]] | None = None,
    ) -> RetrievedContext:
        started_at = perf_counter()
        normalized_query = query_text.strip()
        query_normalized, query_tokens = normalize_and_tokenize(normalized_query)
        query_quoted_phrases = list(quoted_phrases(normalized_query))
        attachment_revision_ids = sorted(collect_attachment_revision_ids(attachments))
        where_filter = build_retrieval_where_filter(
            active_space_id, attachments, attachment_revision_ids=attachment_revision_ids
        )
        attachment_revision_scope_count = len(attachment_revision_ids)

        if not should_retrieve_knowledge(normalized_query, attachments=attachments):
            return self.context_builder.empty_context(
                started_at=started_at,
                attachment_revision_scope_count=attachment_revision_scope_count,
                strategy="none",
            )

        if not self.query_engine.has_retrievable_documents(active_space_id):
            return self.context_builder.empty_context(
                started_at=started_at,
                attachment_revision_scope_count=attachment_revision_scope_count,
                strategy="none",
            )

        generation = getattr(self.settings, "active_index_generation", 1)
        query_embedding = self.query_engine.embed_query_or_none(normalized_query)
        vector_chunks = self.query_engine.query_retrieved_chunks(
            normalized_query,
            attachment_revision_ids=attachment_revision_ids,
            generation=generation,
            query_embedding=query_embedding,
            where_filter=where_filter,
        )

        relevant_chunks = self._filter_relevant_chunks(
            vector_chunks, normalized_query, query_normalized, query_tokens, query_quoted_phrases
        )
        if relevant_chunks:
            return self.context_builder.build_context(
                relevant_chunks,
                active_space_id,
                diagnostics=self.context_builder.build_diagnostics(
                    strategy="vector",
                    started_at=started_at,
                    candidate_count=len(vector_chunks),
                    attachment_revision_scope_count=attachment_revision_scope_count,
                ),
            )

        lexical_chunks = self.query_engine.query_lexical_chunks(
            normalized_query,
            active_space_id=active_space_id,
            attachment_revision_ids=attachment_revision_ids,
            generation=generation,
        )
        relevant_chunks = self._filter_relevant_chunks(
            lexical_chunks, normalized_query, query_normalized, query_tokens, query_quoted_phrases
        )
        if relevant_chunks:
            return self.context_builder.build_context(
                relevant_chunks,
                active_space_id,
                diagnostics=self.context_builder.build_diagnostics(
                    strategy="lexical",
                    started_at=started_at,
                    candidate_count=len(lexical_chunks),
                    attachment_revision_scope_count=attachment_revision_scope_count,
                ),
            )

        return self.context_builder.empty_context(
            started_at=started_at,
            attachment_revision_scope_count=attachment_revision_scope_count,
            strategy="none",
        )

    def _filter_relevant_chunks(
        self,
        chunks: list[dict[str, Any]],
        normalized_query: str,
        query_normalized: str,
        query_tokens: set[str],
        query_quoted_phrases: list[str],
    ) -> list[dict[str, Any]]:
        return [
            record
            for record in chunks
            if self.query_engine.is_relevant_retrieval_hit(
                record,
                normalized_query,
                query_normalized=query_normalized,
                query_tokens=query_tokens,
                query_quoted_phrases=query_quoted_phrases,
            )
        ]
