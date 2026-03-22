"""聊天相关服务模块。"""

from __future__ import annotations

from typing import Any

from knowledge_chatbox_api.schemas.chat import dump_chat_attachments


def build_attachment_metadata(attachments: list[Any] | None) -> list[dict[str, Any]] | None:
    """把消息附件整理为统一元数据结构。"""
    return dump_chat_attachments(attachments)
