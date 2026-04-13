"""聊天相关服务模块。"""

import orjson

from knowledge_chatbox_api.services.chat.stream_events import (
    StreamEvent,
    StreamEventEnvelope,
    StreamEventPayload,
)


class ChatStreamPresenter:
    """负责把聊天运行结果转换为流式事件。"""

    def event(
        self,
        name: StreamEvent,
        data: StreamEventPayload | dict[str, object],
    ) -> StreamEventEnvelope:
        if isinstance(data, StreamEventPayload):
            payload = data
        else:
            payload = StreamEventPayload.model_validate(data)
        return StreamEventEnvelope(event=name, data=payload)

    def to_sse(self, event: StreamEventEnvelope) -> dict[str, str]:
        return {
            "event": event.event,
            "data": orjson.dumps(event.data.model_dump(exclude_none=True)).decode("utf-8"),
        }
