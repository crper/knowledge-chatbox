from __future__ import annotations

import threading
from types import SimpleNamespace
from typing import Any, cast

from knowledge_chatbox_api.services.chat.retrieval.models import (
    RetrievalDiagnostics,
    RetrievedContext,
)
from knowledge_chatbox_api.services.chat.retrieval_service import RetrievalService


class FakeContextBuilder:
    def empty_context(
        self,
        *,
        started_at: float,
        attachment_revision_scope_count: int,
        strategy: str = "none",
    ) -> RetrievedContext:
        del started_at
        return RetrievedContext(
            context_sections=[],
            sources=[],
            diagnostics=RetrievalDiagnostics(
                strategy=strategy,
                attachment_revision_scope_count=attachment_revision_scope_count,
            ),
        )

    def build_context(
        self,
        retrieved_chunks: list[dict[str, object]],
        active_space_id: int | None,
        *,
        diagnostics: RetrievalDiagnostics,
    ) -> RetrievedContext:
        del active_space_id
        return RetrievedContext(
            context_sections=[str(chunk["id"]) for chunk in retrieved_chunks],
            sources=[],
            diagnostics=diagnostics,
        )

    def build_diagnostics(
        self,
        *,
        strategy: str,
        started_at: float,
        candidate_count: int,
        attachment_revision_scope_count: int,
    ) -> RetrievalDiagnostics:
        del started_at
        return RetrievalDiagnostics(
            strategy=strategy,
            candidate_count=candidate_count,
            attachment_revision_scope_count=attachment_revision_scope_count,
        )


class FakeQueryEngine:
    def __init__(self) -> None:
        self._call_index = 0
        self._lock = threading.Lock()
        self.first_call_started = threading.Event()
        self.release_first_call = threading.Event()

    def has_retrievable_documents(self, space_id: int | None) -> bool:
        return space_id is not None

    def embed_query_or_none(self, query_text: str) -> list[float] | None:
        del query_text
        with self._lock:
            call_index = self._call_index
            self._call_index += 1

        if call_index == 0:
            self.first_call_started.set()
            self.release_first_call.wait(timeout=1)
            return None

        return [0.1, 0.2]

    def query_lexical_chunks(
        self,
        query_text: str,
        *,
        active_space_id: int | None,
        attachment_revision_ids: list[int],
        generation: int,
    ) -> list[dict[str, object]]:
        del query_text, active_space_id, attachment_revision_ids, generation
        return [
            {
                "id": "lexical-hit",
                "score": 0.9,
                "text": "lexical hit",
                "metadata": {},
            }
        ]

    def query_retrieved_chunks(
        self,
        query_text: str,
        *,
        attachment_revision_ids: list[int],
        generation: int,
        query_embedding: list[float] | None,
        where_filter: dict[str, object] | None,
    ) -> list[dict[str, object]]:
        del query_text, attachment_revision_ids, generation, where_filter
        if query_embedding is None:
            return []
        return [
            {
                "id": "vector-hit",
                "score": 0.9,
                "text": "vector hit",
                "metadata": {},
            }
        ]

    def is_relevant_retrieval_hit(
        self,
        record: dict[str, object],
        query_text: str,
        *,
        query_normalized: str | None = None,
        query_tokens: set[str] | None = None,
        query_quoted_phrases: list[str] | None = None,
    ) -> bool:
        del record, query_text, query_normalized, query_tokens, query_quoted_phrases
        return True


def build_service(query_engine: FakeQueryEngine) -> RetrievalService:
    service = RetrievalService.__new__(RetrievalService)
    cast("Any", service).settings = SimpleNamespace(active_index_generation=1)
    cast("Any", service).context_builder = FakeContextBuilder()
    cast("Any", service).query_engine = query_engine
    return service


def test_retrieval_does_not_share_a_stuck_embedding_worker() -> None:
    query_engine = FakeQueryEngine()
    service = build_service(query_engine)

    first_result: dict[str, RetrievedContext] = {}

    def run_first_request() -> None:
        first_result["context"] = service.retrieve_context(
            "first retrieval question",
            active_space_id=1,
        )

    first_thread = threading.Thread(target=run_first_request, daemon=True)
    first_thread.start()
    assert query_engine.first_call_started.wait(timeout=1)

    try:
        second_context = service.retrieve_context(
            "second retrieval question",
            active_space_id=1,
        )
    finally:
        query_engine.release_first_call.set()
        first_thread.join(timeout=1)

    assert second_context.diagnostics.strategy == "vector"
    assert second_context.context_sections == ["vector-hit"]
    assert "context" in first_result
