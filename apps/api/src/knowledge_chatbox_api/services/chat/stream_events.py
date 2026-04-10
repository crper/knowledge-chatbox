"""聊天流式事件名称常量。"""

from typing import Any, Literal, TypedDict

RUN_STARTED_EVENT = "run.started"
MESSAGE_STARTED_EVENT = "message.started"
TOOL_CALL_EVENT = "tool.call"
TOOL_RESULT_EVENT = "tool.result"
PART_SOURCE_EVENT = "part.source"
PART_TEXT_START_EVENT = "part.text.start"
PART_TEXT_DELTA_EVENT = "part.text.delta"
PART_TEXT_END_EVENT = "part.text.end"
USAGE_FINAL_EVENT = "usage.final"
MESSAGE_COMPLETED_EVENT = "message.completed"
RUN_COMPLETED_EVENT = "run.completed"
RUN_FAILED_EVENT = "run.failed"

type StreamEventName = Literal[
    "run.started",
    "message.started",
    "tool.call",
    "tool.result",
    "part.source",
    "part.text.start",
    "part.text.delta",
    "part.text.end",
    "usage.final",
    "message.completed",
    "run.completed",
    "run.failed",
]

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
