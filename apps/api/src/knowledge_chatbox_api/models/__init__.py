"""Init数据模型定义。"""

from __future__ import annotations

from knowledge_chatbox_api.models.auth import AuthSession, User
from knowledge_chatbox_api.models.chat import (
    ChatMessage,
    ChatMessageAttachment,
    ChatRun,
    ChatSession,
)
from knowledge_chatbox_api.models.document import Document, DocumentRevision
from knowledge_chatbox_api.models.settings import AppSettings
from knowledge_chatbox_api.models.space import Space

__all__ = [
    "AppSettings",
    "AuthSession",
    "ChatMessage",
    "ChatMessageAttachment",
    "ChatRun",
    "ChatSession",
    "Document",
    "DocumentRevision",
    "Space",
    "User",
]
