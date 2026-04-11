"""聊天流式事件名称常量。"""

from enum import StrEnum
from typing import Any, TypedDict


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


type StreamEventName = StreamEvent

type StreamEventPayload = dict[str, Any]
type StreamEventBatchItem = tuple[StreamEventName, StreamEventPayload]


class StreamEventEnvelope(TypedDict):
    event: StreamEventName
    data: StreamEventPayload


def append_event_batch(
    *,
    run_id: int,
    current_seq: int,
    events: list[StreamEventBatchItem],
    event_repository,
    presenter,
    session,
) -> tuple[int, list[StreamEventEnvelope]]:
    if not events:
        return current_seq, []

    next_seq = current_seq
    presented_events: list[StreamEventEnvelope] = []
    for event_name, data in events:
        next_seq += 1
        event_repository.append_event(
            run_id=run_id,
            seq=next_seq,
            event_type=event_name,
            payload_json=data,
            flush=False,
        )
        presented_events.append(presenter.event(event_name, data))

    session.commit()
    return next_seq, presented_events
