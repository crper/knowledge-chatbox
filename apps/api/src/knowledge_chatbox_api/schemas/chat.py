"""聊天 Pydantic 模型定义。"""

from collections.abc import Sequence
from datetime import datetime
from typing import Any

from pydantic import AliasChoices, ConfigDict, Field, TypeAdapter

from knowledge_chatbox_api.models.enums import (
    ChatAttachmentType,
    ChatMessageRole,
    ChatMessageStatus,
    ReasoningMode,
    ResponseProvider,
)
from knowledge_chatbox_api.schemas import BaseSchema, InputSchema, ReadOnlySchema


class UsageData(BaseSchema):
    """LLM 调用使用量数据。"""

    model_config = ConfigDict(extra="allow")

    request_tokens: int | None = None
    response_tokens: int | None = None
    total_tokens: int | None = None
    details: dict[str, int] | None = None


class PromptAttachmentItem(BaseSchema):
    """Prompt 附件项，用于工作流中传递附件数据。"""

    type: str
    text: str | None = None
    data_base64: str | None = None
    mime_type: str | None = None
    name: str | None = None
    attachment_id: str | None = None
    document_id: int | None = None
    document_revision_id: int | None = None


class ChatAttachmentInput(BaseSchema):
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
        ),
    )


class ChatAttachmentMetadata(BaseSchema):
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
    """把聊天附件输入统一收紧为已验证模型。

    支持输入已验证的 ChatAttachmentInput 对象或原始字典数据，
    使用 TypeAdapter 进行统一验证和转换。

    Args:
        attachments: 附件输入序列，可为 None 或空序列

    Returns:
        验证后的 ChatAttachmentInput 对象列表，输入为空时返回空列表

    Example:
        >>> parse_chat_attachment_inputs([{"attachment_id": "123", "type": "image"}])
        [ChatAttachmentInput(attachment_id="123", type=ChatAttachmentType.IMAGE, ...)]
        >>> parse_chat_attachment_inputs(None)
        []
    """
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
        ChatAttachmentMetadata.model_validate(a.model_dump(), from_attributes=True)
        for a in input_attachments
    ]


def dump_chat_attachments(
    attachments: Sequence[ChatAttachmentMetadata] | None,
) -> list[dict[str, Any]] | None:
    """将附件模型序列化为字典列表，用于 JSON 存储。

    Args:
        attachments: ChatAttachmentMetadata 序列，可为 None 或空序列

    Returns:
        附件数据的字典列表，输入为空时返回 None
    """
    if not attachments:
        return None
    return [attachment.model_dump() for attachment in attachments]


class ArchiveChatAttachmentRequest(InputSchema):
    document_revision_id: int = Field(ge=1)


class CreateChatSessionRequest(InputSchema):
    """Request to create a new chat session."""

    title: str | None = Field(
        default=None,
        max_length=200,
        description="Optional session title; auto-generated if not provided",
    )
    reasoning_mode: ReasoningMode = Field(
        default=ReasoningMode.DEFAULT,
        description="Reasoning mode for the session",
    )


class UpdateChatSessionRequest(InputSchema):
    title: str | None = Field(default=None, max_length=200)
    reasoning_mode: ReasoningMode | None = None


class CreateChatMessageRequest(InputSchema):
    """Request to create a new chat message."""

    attachments: list[ChatAttachmentInput] | None = Field(
        default=None,
        description="Optional list of document attachments",
    )
    content: str = Field(
        min_length=1,
        max_length=10000,
        description="Message content / user question",
    )
    client_request_id: str = Field(
        min_length=1,
        max_length=128,
        description="Client-generated ID for idempotency and retry tracking",
    )
    retry_of_message_id: int | None = Field(
        default=None,
        ge=1,
        description="If set, indicates this is a retry of the specified message",
    )


class CancelChatStreamRequest(InputSchema):
    client_request_id: str = Field(min_length=1, max_length=128)


class CancelChatRunResult(ReadOnlySchema):
    cancelled: bool


class DeleteChatMessageResult(ReadOnlySchema):
    deleted: bool


class DeleteChatSessionResult(ReadOnlySchema):
    deleted: bool


class ChatSourceRead(ReadOnlySchema):
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


class ChatSessionRead(ReadOnlySchema):
    """聊天会话响应体。"""

    id: int
    user_id: int
    title: str | None
    reasoning_mode: ReasoningMode
    created_at: datetime
    updated_at: datetime


class ChatMessageRead(ReadOnlySchema):
    """聊天消息响应体。"""

    attachments: list[ChatAttachmentMetadata] | None = Field(
        default=None,
        validation_alias=AliasChoices("attachments", "attachments_json"),
    )
    id: int
    session_id: int
    role: ChatMessageRole
    content: str
    status: ChatMessageStatus
    client_request_id: str | None
    error_message: str | None
    retry_of_message_id: int | None
    reply_to_message_id: int | None
    sources: list[ChatSourceRead] | None = Field(
        default=None,
        validation_alias=AliasChoices("sources", "sources_json"),
    )
    created_at: datetime


class ChatSessionContextRead(ReadOnlySchema):
    session_id: int
    attachment_count: int
    attachments: list[ChatAttachmentMetadata]
    latest_assistant_message_id: int | None
    latest_assistant_sources: list[ChatSourceRead]


class ChatMessagePairRead(ReadOnlySchema):
    user_message: ChatMessageRead
    assistant_message: ChatMessageRead


class ChatRunEventRead(ReadOnlySchema):
    """聊天运行事件响应体。"""

    id: int
    run_id: int
    seq: int
    event_type: str
    payload_json: dict[str, Any]
    created_at: datetime


class ChatRunRead(ReadOnlySchema):
    """聊天运行响应体。"""

    id: int
    session_id: int
    parent_run_id: int | None
    user_message_id: int | None
    assistant_message_id: int | None
    status: str
    response_provider: str
    response_model: str
    reasoning_mode: ReasoningMode
    client_request_id: str
    usage_json: dict[str, Any] | None
    error_code: str | None
    error_message: str | None
    started_at: datetime | None
    finished_at: datetime | None
    created_at: datetime
    updated_at: datetime


class ChatProfileRead(ReadOnlySchema):
    provider: ResponseProvider
    model: str | None
    configured: bool


class ActiveChatRunRead(ReadOnlySchema):
    """活跃聊天运行响应体。"""

    id: int
    session_id: int
    assistant_message_id: int | None
    status: str
    reasoning_mode: ReasoningMode
    started_at: datetime | None
