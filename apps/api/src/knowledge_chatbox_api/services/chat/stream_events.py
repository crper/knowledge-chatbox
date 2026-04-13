"""聊天流式事件名称常量。"""

from enum import StrEnum
from typing import TYPE_CHECKING, Any

from pydantic import BaseModel, ConfigDict

from knowledge_chatbox_api.schemas.chat import UsageData
from knowledge_chatbox_api.services.chat.workflow.output import WorkflowSource

if TYPE_CHECKING:
    from sqlalchemy.orm import Session

    from knowledge_chatbox_api.repositories.chat_run_event_repository import (
        ChatRunEventRepository,
    )
    from knowledge_chatbox_api.services.chat.chat_stream_presenter import (
        ChatStreamPresenter,
    )


class StreamEvent(StrEnum):
    RUN_STARTED = "run.started"
    MESSAGE_STARTED = "message.started"
    TOOL_CALL = "tool.call"
    TOOL_RESULT = "tool.result"
    PART_SOURCE = "part.source"
    PART_TEXT_START = "part.text.start"
    PART_TEXT_DELTA = "part.text.delta"
    PART_TEXT_END = "part.text.end"
    USAGE_FINAL = "usage.final"
    MESSAGE_COMPLETED = "message.completed"
    RUN_COMPLETED = "run.completed"
    RUN_FAILED = "run.failed"


class StreamEventPayload(BaseModel):
    """流式事件载荷。"""

    model_config = ConfigDict(extra="allow")

    run_id: int | None = None
    assistant_message_id: int | None = None
    delta: str | None = None
    error_message: str | None = None
    usage: UsageData | None = None
    status: str | None = None
    session_id: int | None = None
    user_message_id: int | None = None
    role: str | None = None
    tool_name: str | None = None
    input: Any = None
    sources_count: int | None = None
    source: WorkflowSource | None = None


class StreamEventBatchItem(BaseModel):
    """流式事件批次项。"""

    model_config = ConfigDict(frozen=True)

    event_name: StreamEvent
    payload: StreamEventPayload


class StreamEventEnvelope(BaseModel):
    """流式事件信封。"""

    event: StreamEvent
    data: StreamEventPayload


def append_event_batch(
    *,
    run_id: int,
    current_seq: int,
    events: list[StreamEventBatchItem],
    event_repository: "ChatRunEventRepository",
    presenter: "ChatStreamPresenter",
    session: "Session",
) -> tuple[int, list[StreamEventEnvelope]]:
    if not events:
        return current_seq, []

    next_seq: int = current_seq
    presented_events: list[StreamEventEnvelope] = []
    for batch_item in events:
        next_seq += 1
        event_repository.append_event(
            run_id=run_id,
            seq=next_seq,
            event_type=batch_item.event_name,
            payload_json=batch_item.payload.model_dump(exclude_none=True),
            flush=False,
        )
        presented_events.append(
            presenter.event(
                batch_item.event_name,
                batch_item.payload.model_dump(exclude_none=True),
            )
        )

    session.commit()
    return next_seq, presented_events
