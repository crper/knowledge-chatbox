"""聊天数据模型定义。"""

from __future__ import annotations

from datetime import datetime

from sqlalchemy import (
    JSON,
    CheckConstraint,
    DateTime,
    ForeignKey,
    Index,
    String,
    Text,
    UniqueConstraint,
    func,
    text,
)
from sqlalchemy.orm import Mapped, mapped_column, synonym

from knowledge_chatbox_api.db.base import Base

REASONING_MODE_VALUES = ("default", "off", "on")


class ChatSession(Base):
    """定义聊天会话数据模型。"""

    __tablename__ = "chat_sessions"
    __table_args__ = (
        CheckConstraint("status IN ('active', 'archived')", name="ck_chat_sessions_status"),
        CheckConstraint(
            "reasoning_mode IN ('default', 'off', 'on')",
            name="ck_chat_sessions_reasoning_mode",
        ),
        Index("ix_chat_sessions_user_updated", "user_id", "updated_at", "id"),
        Index("ix_chat_sessions_space_updated", "space_id", "updated_at", "id"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    space_id: Mapped[int] = mapped_column(
        ForeignKey("spaces.id", ondelete="CASCADE"), nullable=False
    )
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    title: Mapped[str | None] = mapped_column(String(255))
    status: Mapped[str] = mapped_column(String(16), nullable=False, default="active")
    reasoning_mode: Mapped[str] = mapped_column(String(16), nullable=False, default="default")
    last_message_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False
    )


class ChatRun(Base):
    """定义聊天运行数据模型。"""

    __tablename__ = "chat_runs"
    __table_args__ = (
        CheckConstraint(
            "status IN ('pending', 'running', 'succeeded', 'failed', 'cancelled')",
            name="ck_chat_runs_status",
        ),
        CheckConstraint(
            "reasoning_mode IN ('default', 'off', 'on')",
            name="ck_chat_runs_reasoning_mode",
        ),
        Index("ix_chat_runs_session_status_created", "session_id", "status", "created_at"),
        Index("ix_chat_runs_client_request_id", "client_request_id"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    session_id: Mapped[int] = mapped_column(
        ForeignKey("chat_sessions.id", ondelete="CASCADE"), nullable=False
    )
    parent_run_id: Mapped[int | None] = mapped_column(
        ForeignKey("chat_runs.id", ondelete="SET NULL")
    )
    user_message_id: Mapped[int | None] = mapped_column(
        ForeignKey("chat_messages.id", ondelete="SET NULL")
    )
    assistant_message_id: Mapped[int | None] = mapped_column(
        ForeignKey("chat_messages.id", ondelete="SET NULL")
    )
    status: Mapped[str] = mapped_column(String(16), nullable=False)
    response_provider: Mapped[str] = mapped_column(String(32), nullable=False)
    response_model: Mapped[str] = mapped_column(String(255), nullable=False)
    reasoning_mode: Mapped[str] = mapped_column(String(16), nullable=False, default="default")
    client_request_id: Mapped[str] = mapped_column(String(64), nullable=False)
    usage_json: Mapped[dict | None] = mapped_column(JSON)
    error_code: Mapped[str | None] = mapped_column(String(64))
    error_message: Mapped[str | None] = mapped_column(Text)
    started_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    finished_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False
    )


class ChatRunEvent(Base):
    """定义聊天运行事件数据模型。"""

    __tablename__ = "chat_run_events"
    __table_args__ = (
        UniqueConstraint("run_id", "seq", name="uq_chat_run_events_run_seq"),
        Index("ix_chat_run_events_run_seq", "run_id", "seq"),
        Index("ix_chat_run_events_type", "event_type"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    run_id: Mapped[int] = mapped_column(
        ForeignKey("chat_runs.id", ondelete="CASCADE"), nullable=False
    )
    seq: Mapped[int] = mapped_column(nullable=False)
    event_type: Mapped[str] = mapped_column(String(64), nullable=False)
    payload_json: Mapped[dict] = mapped_column(JSON, nullable=False, default=dict)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )


class ChatMessage(Base):
    """定义聊天消息投影数据模型。"""

    __tablename__ = "chat_messages"
    __table_args__ = (
        CheckConstraint("role IN ('user', 'assistant', 'system')", name="ck_chat_messages_role"),
        CheckConstraint(
            "status IN ('pending', 'streaming', 'succeeded', 'failed', 'cancelled')",
            name="ck_chat_messages_status",
        ),
        CheckConstraint(
            "((role = 'user' AND client_request_id IS NOT NULL) "
            "OR (role IN ('assistant', 'system') AND client_request_id IS NULL))",
            name="ck_chat_messages_client_request_id",
        ),
        Index(
            "uq_chat_messages_user_request",
            "session_id",
            "client_request_id",
            unique=True,
            sqlite_where=text("role = 'user' AND client_request_id IS NOT NULL"),
        ),
        Index("ix_chat_messages_session_created", "session_id", "id"),
        Index("ix_chat_messages_reply_to_message_id", "reply_to_message_id"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    session_id: Mapped[int] = mapped_column(
        ForeignKey("chat_sessions.id", ondelete="CASCADE"), nullable=False
    )
    role: Mapped[str] = mapped_column(String(16), nullable=False)
    content: Mapped[str] = mapped_column(Text, nullable=False)
    status: Mapped[str] = mapped_column(String(16), nullable=False)
    client_request_id: Mapped[str | None] = mapped_column(String(64))
    error_message: Mapped[str | None] = mapped_column(Text)
    retry_of_message_id: Mapped[int | None] = mapped_column(
        ForeignKey("chat_messages.id", ondelete="SET NULL")
    )
    reply_to_message_id: Mapped[int | None] = mapped_column(
        ForeignKey("chat_messages.id", ondelete="SET NULL")
    )
    sources_json: Mapped[list[dict] | None] = mapped_column(JSON)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False
    )


class ChatMessageAttachment(Base):
    """定义聊天消息附件数据模型。"""

    __tablename__ = "chat_message_attachments"
    __allow_unmapped__ = True
    __table_args__ = (
        UniqueConstraint(
            "message_id",
            "attachment_id",
            name="uq_chat_message_attachments_message_attachment_id",
        ),
        CheckConstraint(
            "type IN ('image', 'document')",
            name="ck_chat_message_attachments_type",
        ),
        Index("ix_chat_message_attachments_message_id", "message_id"),
        Index("ix_chat_message_attachments_document_revision_id", "document_revision_id"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    message_id: Mapped[int] = mapped_column(
        ForeignKey("chat_messages.id", ondelete="CASCADE"), nullable=False
    )
    attachment_id: Mapped[str] = mapped_column(String(64), nullable=False)
    type: Mapped[str] = mapped_column(String(16), nullable=False)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    mime_type: Mapped[str] = mapped_column(String(128), nullable=False)
    size_bytes: Mapped[int] = mapped_column(nullable=False)
    document_revision_id: Mapped[int | None] = mapped_column(
        ForeignKey("document_revisions.id", ondelete="SET NULL")
    )
    archived_at: Mapped[str | None] = mapped_column(String(64))
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    document_id: int | None = None

    resource_document_version_id = synonym("document_revision_id")
