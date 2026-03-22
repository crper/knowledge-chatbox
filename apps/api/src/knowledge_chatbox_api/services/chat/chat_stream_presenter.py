"""聊天相关服务模块。"""

from __future__ import annotations

import json


class ChatStreamPresenter:
    """负责把聊天运行结果转换为流式事件。"""

    def event(self, name: str, data: dict) -> dict:
        """处理事件相关逻辑。"""
        return {"event": name, "data": data}

    def to_sse(self, event: dict) -> str:
        """把Sse转换为响应结构。"""
        payload = json.dumps(event["data"], ensure_ascii=False)
        return f"event: {event['event']}\ndata: {payload}\n\n"
