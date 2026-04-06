from __future__ import annotations

from collections.abc import Sequence
from typing import Any

from pydantic import BaseModel
from pydantic_ai import AgentRunResultEvent
from pydantic_ai.messages import (
    FinalResultEvent,
    FunctionToolCallEvent,
    FunctionToolResultEvent,
    PartDeltaEvent,
    PartStartEvent,
    TextPart,
    TextPartDelta,
)

from knowledge_chatbox_api.services.chat.stream_events import (
    PART_SOURCE_EVENT,
    PART_TEXT_DELTA_EVENT,
    PART_TEXT_START_EVENT,
    TOOL_CALL_EVENT,
    TOOL_RESULT_EVENT,
    StreamEventBatchItem,
)


def _to_dict(value: Any) -> Any:
    if isinstance(value, BaseModel):
        return value.model_dump()
    return value


class ChatWorkflowEventBridge:
    def map_event(
        self,
        event: Any,
        *,
        run_id: int,
        assistant_message_id: int,
    ) -> list[StreamEventBatchItem]:
        if isinstance(event, FunctionToolCallEvent):
            return [
                (
                    TOOL_CALL_EVENT,
                    {
                        "run_id": run_id,
                        "tool_name": event.part.tool_name,
                        "input": _to_dict(event.part.args) or {},
                    },
                )
            ]

        if isinstance(event, FunctionToolResultEvent):
            tool_name = event.result.tool_name
            content = _to_dict(event.result.content)
            sources = self._extract_sources(content)
            events: list[StreamEventBatchItem] = [
                (
                    TOOL_RESULT_EVENT,
                    {
                        "run_id": run_id,
                        "tool_name": tool_name,
                        "sources_count": len(sources),
                    },
                )
            ]
            events.extend(
                (
                    PART_SOURCE_EVENT,
                    {
                        "run_id": run_id,
                        "assistant_message_id": assistant_message_id,
                        "source": source,
                    },
                )
                for source in sources
            )
            return events

        if isinstance(event, PartStartEvent) and isinstance(event.part, TextPart):
            return [
                (
                    PART_TEXT_START_EVENT,
                    {"run_id": run_id, "assistant_message_id": assistant_message_id},
                )
            ]

        if isinstance(event, PartDeltaEvent) and isinstance(event.delta, TextPartDelta):
            return [
                (
                    PART_TEXT_DELTA_EVENT,
                    {
                        "run_id": run_id,
                        "assistant_message_id": assistant_message_id,
                        "delta": event.delta.content_delta,
                    },
                )
            ]

        if isinstance(event, FinalResultEvent):
            return []

        return []

    def extract_result(self, event: AgentRunResultEvent):
        return event.result.output, event.result.usage()

    def extract_sources(self, content: Any) -> list[dict[str, Any]]:
        raw_sources = self._extract_sources(content)
        return [
            source
            for source in raw_sources
            if isinstance(source, dict)
        ]

    def _extract_sources(self, content: Any) -> list[dict[str, Any]]:
        if isinstance(content, dict):
            raw_sources = content.get("sources")
        else:
            raw_sources = getattr(content, "sources", None)

        if not isinstance(raw_sources, Sequence) or isinstance(raw_sources, (str, bytes)):
            return []

        normalized: list[dict[str, Any]] = []
        for source in raw_sources:
            dumped = _to_dict(source)
            if isinstance(dumped, dict):
                normalized.append(dumped)
        return normalized
