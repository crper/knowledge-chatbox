from __future__ import annotations

from typing import TYPE_CHECKING, Any, cast

from pydantic_ai import AgentRunResultEvent
from pydantic_ai.messages import (
    FinalResultEvent,
    FunctionToolCallEvent,
    FunctionToolResultEvent,
    PartDeltaEvent,
    PartEndEvent,
    PartStartEvent,
    TextPart,
    TextPartDelta,
    ToolCallPart,
    ToolReturnPart,
)
from pydantic_ai.usage import RunUsage

from knowledge_chatbox_api.services.chat.workflow.output import ChatWorkflowResult
from knowledge_chatbox_api.utils.chroma import (
    _matches_where_clause,  # pyright: ignore[reportPrivateUsage]
    _score_records,  # pyright: ignore[reportPrivateUsage]
)

if TYPE_CHECKING:
    from collections.abc import AsyncIterator


class InMemoryChromaStore:
    """Cheap in-memory store used by unit tests and isolated service checks."""

    def __init__(self) -> None:
        self._records_by_generation: dict[int, dict[str, dict[str, Any]]] = {}

    def warmup(self, generation: int = 1) -> None:
        del generation

    def upsert(
        self,
        records: list[dict[str, Any]],
        *,
        embeddings: list[list[float]] | None = None,
        generation: int = 1,
    ) -> None:
        store = self._records_by_generation.setdefault(generation, {})
        for index, record in enumerate(records):
            stored_record = dict(record)
            if embeddings is not None and index < len(embeddings):
                stored_record["embedding"] = embeddings[index]
            store[record["id"]] = stored_record

    def list_by_document_id(
        self,
        document_id: int,
        *,
        generation: int = 1,
    ) -> list[dict[str, Any]]:
        records = self._records_by_generation.get(generation, {})
        return [
            record for record in records.values() if record["document_revision_id"] == document_id
        ]

    def delete_by_document_id(self, document_id: int, *, generation: int = 1) -> None:
        ids_to_delete = [
            record_id
            for record_id, record in self._records_by_generation.get(generation, {}).items()
            if record["document_revision_id"] == document_id
        ]
        for record_id in ids_to_delete:
            self._records_by_generation.get(generation, {}).pop(record_id, None)

    def clear_generation(self, generation: int) -> None:
        self._records_by_generation.pop(generation, None)

    def query(
        self,
        query_text: str,
        *,
        query_embedding: list[float] | None = None,
        top_k: int = 3,
        generation: int = 1,
        where: dict[str, Any] | None = None,
    ) -> list[dict[str, Any]]:
        del query_embedding
        records = list(self._records_by_generation.get(generation, {}).values())
        filtered = self._apply_where_filter(records, where)
        return _score_records(filtered, query_text, top_k=top_k)

    def _apply_where_filter(
        self,
        records: list[dict[str, Any]],
        where: dict[str, Any] | None,
    ) -> list[dict[str, Any]]:
        if not where:
            return records
        return [record for record in records if _matches_where_clause(record, where)]


class ResponseAdapterStub:
    """统一的响应适配器 Stub"""

    def __init__(self) -> None:
        self.response_calls: list[list[dict[str, Any]]] = []

    def response(self, messages: list[dict[str, Any]], settings) -> str:
        del settings
        self.response_calls.append(messages)
        return "同步回答"


class EmbeddingAdapterStub:
    """统一的嵌入适配器 Stub"""

    def __init__(self) -> None:
        self.embed_calls: list[list[str]] = []

    def embed(self, texts: list[str], settings) -> list[list[float]]:
        del settings
        self.embed_calls.append(texts)
        return [[0.1] * 8]


class FailingEmbeddingAdapterStub:
    """模拟失败的嵌入适配器"""

    def __init__(self) -> None:
        self.embed_calls: list[list[str]] = []

    def embed(self, texts: list[str], settings) -> list[list[float]]:
        self.embed_calls.append(texts)
        del settings
        raise RuntimeError("embedding backend unavailable")


class WorkflowRunResultStub:
    def __init__(self, output: str, usage: dict[str, Any] | None = None) -> None:
        self.output = output
        self._usage = usage or {}

    def usage(self):
        return RunUsage(**self._usage)


def make_adapter_backed_chat_workflow_class(
    *,
    response_adapter: Any | None = None,
    sync_answer: str = "workflow sync answer",
    sync_sources: list[dict[str, Any]] | None = None,
    stream_sources: list[dict[str, Any]] | None = None,
) -> type:
    class AdapterBackedChatWorkflow:
        def run_sync(self, *, deps, session_id: int, question: str, attachments=None):
            del attachments
            assert deps.request_metadata["path"] == "sync"
            assert session_id > 0
            assert isinstance(question, str)
            return ChatWorkflowResult(
                answer=sync_answer,
                sources=cast(
                    "Any",
                    sync_sources
                    or [
                        {
                            "document_id": 7,
                            "document_revision_id": 11,
                            "document_name": "playbook.md",
                            "chunk_id": "chunk-1",
                            "snippet": "workflow source",
                            "page_number": None,
                            "section_title": "Intro",
                            "score": 0.82,
                        }
                    ],
                ),
            )

        def run_stream_events(
            self,
            *,
            deps,
            session_id: int,
            question: str,
            attachments=None,
        ) -> AsyncIterator[object]:
            assert deps.request_metadata["path"] == "stream"
            assert session_id > 0

            async def _events():
                yield FunctionToolCallEvent(
                    part=ToolCallPart("knowledge_search", {"query": question}, "call-1")
                )
                yield FunctionToolResultEvent(
                    result=ToolReturnPart(
                        "knowledge_search",
                        {
                            "context_sections": ["Document: source"] if stream_sources else [],
                            "sources": stream_sources or [],
                        },
                        "call-1",
                    )
                )
                if response_adapter is None:
                    yield PartStartEvent(index=0, part=TextPart(""))
                    yield FinalResultEvent(tool_name=None, tool_call_id=None)
                    yield PartDeltaEvent(index=0, delta=TextPartDelta("hello "))
                    yield PartDeltaEvent(index=0, delta=TextPartDelta("world"))
                    yield PartEndEvent(index=0, part=TextPart("hello world"))
                    yield AgentRunResultEvent(
                        result=cast(
                            "Any",
                            WorkflowRunResultStub("hello world", {"output_tokens": 2}),
                        )
                    )
                    return

                text_parts: list[str] = []
                started_text = False
                chat_session: Any = deps.chat_repository.get_session(session_id)
                active_space_id: int | None = (
                    chat_session.space_id if chat_session is not None else None
                )
                prompt_attachments: list[Any] = (
                    deps.prompt_attachment_service.build_prompt_attachments(
                        attachments,
                        active_space_id,
                    )
                )
                prompt_text: str = deps.prompt_attachment_service.resolve_prompt_text(
                    question,
                    attachments,
                )
                if prompt_attachments:
                    user_content: Any = [{"type": "text", "text": prompt_text}, *prompt_attachments]
                else:
                    user_content = question
                for chunk in response_adapter.stream_response(
                    [{"role": "user", "content": user_content}],
                    deps.runtime_settings,
                ):
                    chunk_type: str | None = getattr(chunk, "type", None)
                    if chunk_type is None and isinstance(chunk, dict):
                        chunk_type = chunk.get("type")
                    if chunk_type == "text_delta":
                        delta: Any = getattr(chunk, "delta", None)
                        if delta is None and isinstance(chunk, dict):
                            delta = chunk.get("delta", "")
                        if not started_text:
                            yield PartStartEvent(index=0, part=TextPart(""))
                            yield FinalResultEvent(tool_name=None, tool_call_id=None)
                            started_text = True
                        text_parts.append(str(delta))
                        yield PartDeltaEvent(index=0, delta=TextPartDelta(str(delta)))
                    elif chunk_type == "completed":
                        usage: Any = getattr(chunk, "usage", None)
                        if usage is None and isinstance(chunk, dict):
                            usage = chunk.get("usage", {})
                        if started_text:
                            yield PartEndEvent(index=0, part=TextPart("".join(text_parts)))
                        yield AgentRunResultEvent(
                            result=cast("Any", WorkflowRunResultStub("".join(text_parts), usage))
                        )
                        return
                    elif chunk_type == "error":
                        error_message: str | None = getattr(chunk, "error_message", None)
                        if error_message is None and isinstance(chunk, dict):
                            error_message = chunk.get("error_message")
                        raise RuntimeError(error_message or "provider stream failed")

            return _events()

    return AdapterBackedChatWorkflow
