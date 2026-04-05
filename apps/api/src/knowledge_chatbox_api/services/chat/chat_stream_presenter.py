"""聊天相关服务模块。"""

from __future__ import annotations

import orjson

from knowledge_chatbox_api.services.chat.stream_events import (
    StreamEventEnvelope,
    StreamEventName,
    StreamEventPayload,
)


class ChatStreamPresenter:
    """负责把聊天运行结果转换为流式事件。"""

    def event(
        self,
        name: StreamEventName,
        data: StreamEventPayload,
    ) -> StreamEventEnvelope:
        """处理事件相关逻辑。"""
        return {"event": name, "data": data}

    def to_sse(self, event: StreamEventEnvelope) -> str:
        """把Sse转换为响应结构。"""
        payload = orjson.dumps(event["data"]).decode("utf-8")
        return f"event: {event['event']}\ndata: {payload}\n\n"
