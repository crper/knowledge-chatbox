from collections.abc import Sequence
from typing import Any

from pydantic import BaseModel, TypeAdapter
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
from pydantic_ai.usage import RunUsage

from knowledge_chatbox_api.core.logging import get_logger
from knowledge_chatbox_api.services.chat.stream_events import (
    StreamEvent,
    StreamEventBatchItem,
    StreamEventPayload,
)
from knowledge_chatbox_api.services.chat.workflow.output import (
    ChatWorkflowResult,
    WorkflowSource,
    normalize_chat_workflow_result,
)

logger = get_logger(__name__)

_WORKFLOW_SOURCE_ADAPTER = TypeAdapter(WorkflowSource)


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
                StreamEventBatchItem(
                    event_name=StreamEvent.TOOL_CALL,
                    payload=StreamEventPayload(
                        run_id=run_id,
                        tool_name=event.part.tool_name,
                        input=_to_dict(event.part.args) or {},
                    ),
                )
            ]

        if isinstance(event, FunctionToolResultEvent):
            tool_name = event.result.tool_name
            content = _to_dict(event.result.content)
            sources = self.extract_sources(content)
            events: list[StreamEventBatchItem] = [
                StreamEventBatchItem(
                    event_name=StreamEvent.TOOL_RESULT,
                    payload=StreamEventPayload(
                        run_id=run_id,
                        tool_name=tool_name,
                        sources_count=len(sources),
                    ),
                )
            ]
            events.extend(
                StreamEventBatchItem(
                    event_name=StreamEvent.PART_SOURCE,
                    payload=StreamEventPayload(
                        run_id=run_id,
                        assistant_message_id=assistant_message_id,
                        source=source,
                    ),
                )
                for source in sources
            )
            return events

        if isinstance(event, PartStartEvent) and isinstance(event.part, TextPart):
            return [
                StreamEventBatchItem(
                    event_name=StreamEvent.PART_TEXT_START,
                    payload=StreamEventPayload(
                        run_id=run_id,
                        assistant_message_id=assistant_message_id,
                    ),
                )
            ]

        if isinstance(event, PartDeltaEvent) and isinstance(event.delta, TextPartDelta):
            return [
                StreamEventBatchItem(
                    event_name=StreamEvent.PART_TEXT_DELTA,
                    payload=StreamEventPayload(
                        run_id=run_id,
                        assistant_message_id=assistant_message_id,
                        delta=event.delta.content_delta,
                    ),
                )
            ]

        if isinstance(event, FinalResultEvent):
            return []

        return []

    def extract_result(self, event: AgentRunResultEvent) -> tuple[ChatWorkflowResult, RunUsage]:
        return normalize_chat_workflow_result(event.result.output), event.result.usage()

    def extract_sources(self, content: Any) -> list[WorkflowSource]:
        if isinstance(content, dict):
            raw_sources: Any = content.get("sources")
        else:
            raw_sources = getattr(content, "sources", None)

        if not isinstance(raw_sources, Sequence) or isinstance(raw_sources, (str, bytes)):
            return []

        normalized: list[WorkflowSource] = []
        for source in raw_sources:
            if isinstance(source, WorkflowSource):
                normalized.append(source)
            else:
                try:
                    normalized.append(
                        _WORKFLOW_SOURCE_ADAPTER.validate_python(source, from_attributes=True)
                    )
                except Exception as exc:
                    logger.debug("skip_invalid_workflow_source", exc_info=exc)
                    continue
        return normalized
