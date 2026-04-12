"""聊天 Pydantic 模型定义。"""

from collections.abc import Sequence
from datetime import datetime
from typing import Any

from pydantic import AliasChoices, BaseModel, ConfigDict, Field, TypeAdapter

from knowledge_chatbox_api.models.enums import (
    ChatAttachmentType,
    ChatMessageRole,
    ChatMessageStatus,
    ReasoningMode,
)
from knowledge_chatbox_api.schemas._validators import (
    ReasoningModeLiteral,
    ResponseProviderLiteral,
)


class ChatAttachmentInput(BaseModel):
    """用户提交的聊天附件输入。"""

    model_config = ConfigDict(populate_by_name=True)

    attachment_id: str
    type: ChatAttachmentType
    name: str
    mime_type: str
    size_bytes: int
    document_id: int | None = Field(
        default=None,
        validation_alias=AliasChoices("document_id", "resource_document_id"),
    )
    document_revision_id: int = Field(
        validation_alias=AliasChoices(
            "document_revision_id",
            "resource_document_version_id",
        )
    )


class ChatAttachmentMetadata(BaseModel):
    """统一后的聊天附件元数据。"""

    model_config = ConfigDict(populate_by_name=True)

    attachment_id: str
    type: ChatAttachmentType
    name: str
    mime_type: str
    size_bytes: int
    document_id: int | None = Field(
        default=None,
        validation_alias=AliasChoices("document_id", "resource_document_id"),
    )
    document_revision_id: int | None = Field(
        default=None,
        validation_alias=AliasChoices(
            "document_revision_id",
            "resource_document_version_id",
        ),
    )
    archived_at: datetime | None = None


_CHAT_ATTACHMENT_INPUTS_ADAPTER = TypeAdapter(list[ChatAttachmentInput])


def parse_chat_attachment_inputs(
    attachments: Sequence[ChatAttachmentInput | dict[str, Any]] | None,
) -> list[ChatAttachmentInput]:
    """把聊天附件输入统一收紧为已验证模型。"""
    if not attachments:
        return []
    return _CHAT_ATTACHMENT_INPUTS_ADAPTER.validate_python(attachments)


def serialize_chat_attachments(
    attachments: Sequence[ChatAttachmentInput | dict[str, Any]] | None,
) -> list[ChatAttachmentMetadata] | None:
    """把输入附件规范化为统一输出结构。"""
    input_attachments = parse_chat_attachment_inputs(attachments)
    if not input_attachments:
        return None
    return [
        ChatAttachmentMetadata(
            attachment_id=input_attachment.attachment_id,
            type=input_attachment.type,
            name=input_attachment.name,
            mime_type=input_attachment.mime_type,
            size_bytes=input_attachment.size_bytes,
            document_id=input_attachment.document_id,
            document_revision_id=input_attachment.document_revision_id,
        )
        for input_attachment in input_attachments
    ]


def dump_chat_attachments(
    attachments: Sequence[ChatAttachmentInput | dict[str, Any]] | None,
) -> list[dict[str, Any]] | None:
    metadata = serialize_chat_attachments(attachments)
    if metadata is None:
        return None
    return [attachment.model_dump() for attachment in metadata]


class ArchiveChatAttachmentRequest(BaseModel):
    document_revision_id: int


class CreateChatSessionRequest(BaseModel):
    """Request to create a new chat session."""

    title: str | None = Field(
        default=None,
        description="Optional session title; auto-generated if not provided",
    )
    reasoning_mode: ReasoningMode = Field(
        default=ReasoningMode.DEFAULT,
        description="Reasoning mode for the session",
    )


class UpdateChatSessionRequest(BaseModel):
    title: str | None = None
    reasoning_mode: ReasoningModeLiteral | None = None


class CreateChatMessageRequest(BaseModel):
    """Request to create a new chat message."""

    attachments: list[ChatAttachmentInput] | None = Field(
        default=None,
        description="Optional list of document attachments",
    )
    content: str = Field(description="Message content / user question")
    client_request_id: str = Field(
        description="Client-generated ID for idempotency and retry tracking"
    )
    retry_of_message_id: int | None = Field(
        default=None,
        description="If set, indicates this is a retry of the specified message",
    )


class CancelChatStreamRequest(BaseModel):
    client_request_id: str


class CancelChatRunResult(BaseModel):
    cancelled: bool


class DeleteChatMessageResult(BaseModel):
    deleted: bool


class DeleteChatSessionResult(BaseModel):
    deleted: bool


class ChatSourceRead(BaseModel):
    """聊天来源引用信息。"""

    model_config = ConfigDict(populate_by_name=True)

    chunk_id: str
    document_id: int | None = None
    document_revision_id: int | None = None
    document_name: str | None = None
    page_number: int | None = None
    score: float | None = None
    section_title: str | None = None
    snippet: str | None = None


class ChatSessionRead(BaseModel):
    id: int
    user_id: int
    title: str | None
    reasoning_mode: ReasoningModeLiteral
    created_at: datetime
    updated_at: datetime


class ChatMessageRead(BaseModel):
    attachments_json: list[ChatAttachmentMetadata] | None = None
    id: int
    session_id: int
    role: ChatMessageRole
    content: str
    status: ChatMessageStatus
    client_request_id: str | None
    error_message: str | None
    retry_of_message_id: int | None
    reply_to_message_id: int | None
    sources_json: list[ChatSourceRead] | None
    created_at: datetime


class ChatSessionContextRead(BaseModel):
    session_id: int
    attachment_count: int
    attachments: list[ChatAttachmentMetadata]
    latest_assistant_message_id: int | None
    latest_assistant_sources: list[ChatSourceRead]


class ChatMessagePairRead(BaseModel):
    user_message: ChatMessageRead
    assistant_message: ChatMessageRead


class ChatRunEventRead(BaseModel):
    id: int
    run_id: int
    seq: int
    event_type: str
    payload_json: dict[str, Any]
    created_at: datetime


class ChatRunRead(BaseModel):
    id: int
    session_id: int
    parent_run_id: int | None
    user_message_id: int | None
    assistant_message_id: int | None
    status: str
    response_provider: str
    response_model: str
    reasoning_mode: ReasoningModeLiteral
    client_request_id: str
    usage_json: dict[str, Any] | None
    error_code: str | None
    error_message: str | None
    started_at: datetime | None
    finished_at: datetime | None
    created_at: datetime
    updated_at: datetime


class ChatProfileRead(BaseModel):
    provider: ResponseProviderLiteral
    model: str | None
    configured: bool


class ActiveChatRunRead(BaseModel):
    id: int
    session_id: int
    assistant_message_id: int | None
    status: str
    reasoning_mode: ReasoningModeLiteral
    started_at: datetime | None
