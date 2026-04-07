from __future__ import annotations

from collections.abc import AsyncIterator
from typing import Any

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
    response_adapter=None,
    sync_answer: str = "workflow sync answer",
    sync_sources: list[dict[str, Any]] | None = None,
    stream_sources: list[dict[str, Any]] | None = None,
):
    class AdapterBackedChatWorkflow:
        def run_sync(self, *, deps, session_id: int, question: str, attachments=None):
            assert deps.request_metadata["path"] == "sync"
            assert session_id > 0
            assert isinstance(question, str)
            return ChatWorkflowResult(
                answer=sync_answer,
                sources=sync_sources
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
                        result=WorkflowRunResultStub("hello world", {"output_tokens": 2})
                    )
                    return

                text_parts: list[str] = []
                started_text = False
                chat_session = deps.chat_repository.get_session(session_id)
                active_space_id = chat_session.space_id if chat_session is not None else None
                prompt_attachments = deps.prompt_attachment_service.build_prompt_attachments(
                    attachments,
                    active_space_id,
                )
                prompt_text = deps.prompt_attachment_service.resolve_prompt_text(
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
                    chunk_type = getattr(chunk, "type", None)
                    if chunk_type is None and isinstance(chunk, dict):
                        chunk_type = chunk.get("type")
                    if chunk_type == "text_delta":
                        delta = getattr(chunk, "delta", None)
                        if delta is None and isinstance(chunk, dict):
                            delta = chunk.get("delta", "")
                        if not started_text:
                            yield PartStartEvent(index=0, part=TextPart(""))
                            yield FinalResultEvent(tool_name=None, tool_call_id=None)
                            started_text = True
                        text_parts.append(str(delta))
                        yield PartDeltaEvent(index=0, delta=TextPartDelta(str(delta)))
                    elif chunk_type == "completed":
                        usage = getattr(chunk, "usage", None)
                        if usage is None and isinstance(chunk, dict):
                            usage = chunk.get("usage", {})
                        if started_text:
                            yield PartEndEvent(index=0, part=TextPart("".join(text_parts)))
                        yield AgentRunResultEvent(
                            result=WorkflowRunResultStub("".join(text_parts), usage)
                        )
                        return
                    elif chunk_type == "error":
                        error_message = getattr(chunk, "error_message", None)
                        if error_message is None and isinstance(chunk, dict):
                            error_message = chunk.get("error_message")
                        raise RuntimeError(error_message or "provider stream failed")

            return _events()

    return AdapterBackedChatWorkflow
