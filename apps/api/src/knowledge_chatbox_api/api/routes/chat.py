"""聊天路由定义。"""

from collections.abc import Iterable
from typing import Any, cast

from fastapi import APIRouter, Query, status
from sse_starlette.sse import EventSourceResponse

from knowledge_chatbox_api.api.deps import CurrentUserDep, DbSessionDep, SettingsDep
from knowledge_chatbox_api.api.error_responses import CHAT_STREAM_RESPONSES
from knowledge_chatbox_api.api.routes._common.transforms import model_to_read_simple
from knowledge_chatbox_api.models.chat import (
    ChatMessage,
    ChatMessageAttachment,
    ChatRun,
    ChatSession,
)
from knowledge_chatbox_api.models.enums import ChatMessageRole, ChatMessageStatus, ProviderName
from knowledge_chatbox_api.models.settings import AppSettings
from knowledge_chatbox_api.schemas.chat import (
    ActiveChatRunRead,
    ArchiveChatAttachmentRequest,
    CancelChatRunResult,
    CancelChatStreamRequest,
    ChatAttachmentMetadata,
    ChatAttachmentType,
    ChatMessagePairRead,
    ChatMessageRead,
    ChatProfileRead,
    ChatRunEventRead,
    ChatRunRead,
    ChatSessionContextRead,
    ChatSessionRead,
    ChatSourceRead,
    CreateChatMessageRequest,
    CreateChatSessionRequest,
    DeleteChatMessageResult,
    DeleteChatSessionResult,
    UpdateChatSessionRequest,
)
from knowledge_chatbox_api.schemas.common import Envelope
from knowledge_chatbox_api.services.chat.chat_application_service import (
    ChatApplicationService,
)
from knowledge_chatbox_api.services.chat.stream_events import StreamEventEnvelope
from knowledge_chatbox_api.services.settings.settings_service import SettingsService
from knowledge_chatbox_api.utils.helpers import strip_or_none

router = APIRouter(prefix="/api/chat", tags=["chat"])


def stream_presented_events(
    events: Iterable[StreamEventEnvelope],
    presenter,
):
    try:
        for event in events:
            yield presenter.to_sse(event)
    finally:
        close = getattr(events, "close", None)
        if callable(close):
            close()


def to_chat_session_read(chat_session: ChatSession) -> ChatSessionRead:
    """把会话模型转换为会话响应结构。"""
    return model_to_read_simple(chat_session, ChatSessionRead)


def _build_chat_attachment_payloads(
    attachments: Iterable[ChatMessageAttachment] | None,
) -> list[ChatAttachmentMetadata] | None:
    """构建聊天附件响应载荷。"""
    if not attachments:
        return None
    return [
        ChatAttachmentMetadata(
            attachment_id=attachment.attachment_id,
            type=cast("ChatAttachmentType", attachment.type),
            name=attachment.name,
            mime_type=attachment.mime_type,
            size_bytes=attachment.size_bytes,
            document_id=getattr(attachment, "document_id", None),
            document_revision_id=attachment.document_revision_id,
            archived_at=attachment.archived_at,
        )
        for attachment in attachments
    ]


def _parse_sources_json(sources_json: list[dict[str, Any]] | None) -> list[ChatSourceRead] | None:
    """把来源 JSON 数据解析为 ChatSourceRead 对象列表。"""
    if not sources_json:
        return None
    return [ChatSourceRead.model_validate(source) for source in sources_json]


def to_chat_message_read(
    message: ChatMessage,
    attachments: Iterable[ChatMessageAttachment] | None = None,
) -> ChatMessageRead:
    """把消息模型转换为消息响应结构。"""
    return ChatMessageRead(
        attachments_json=_build_chat_attachment_payloads(attachments),
        id=message.id,
        session_id=message.session_id,
        role=ChatMessageRole(message.role),
        content=message.content,
        status=ChatMessageStatus(message.status),
        client_request_id=message.client_request_id,
        error_message=message.error_message,
        retry_of_message_id=message.retry_of_message_id,
        reply_to_message_id=message.reply_to_message_id,
        sources_json=_parse_sources_json(message.sources_json),
        created_at=message.created_at,
    )


def to_chat_session_context_read(input: dict[str, Any]) -> ChatSessionContextRead:
    """把右栏 context 数据转换为响应结构。"""
    return ChatSessionContextRead(
        session_id=input["session_id"],
        attachment_count=input["attachment_count"],
        attachments=_build_chat_attachment_payloads(input["attachments"]) or [],
        latest_assistant_message_id=input["latest_assistant_message_id"],
        latest_assistant_sources=_parse_sources_json(input["latest_assistant_sources"]) or [],
    )


def to_chat_run_read(chat_run: ChatRun) -> ChatRunRead:
    """把运行记录模型转换为运行响应结构。"""
    return model_to_read_simple(chat_run, ChatRunRead)


def to_active_chat_run_read(chat_run: ChatRun) -> ActiveChatRunRead:
    """把运行记录模型转换为活动运行响应结构。"""
    return model_to_read_simple(chat_run, ActiveChatRunRead)


def to_chat_profile_read(settings_record: AppSettings) -> ChatProfileRead:
    """把设置记录转换为当前聊天配置结构。"""
    return ChatProfileRead(
        provider=settings_record.response_provider,  # type: ignore[arg-type]
        model=settings_record.response_model,
        configured=_is_response_provider_configured(settings_record),
    )


def _is_response_provider_configured(settings_record: AppSettings) -> bool:
    provider = settings_record.response_provider
    if not strip_or_none(settings_record.response_model):
        return False

    profiles = settings_record.provider_profiles
    if provider == ProviderName.ANTHROPIC:
        return bool(strip_or_none(profiles.anthropic.api_key))
    if provider == ProviderName.OLLAMA:
        return bool(strip_or_none(profiles.ollama.base_url))
    return bool(strip_or_none(profiles.openai.api_key))


@router.get("/profile", response_model=Envelope[ChatProfileRead])
def get_chat_profile(
    session: DbSessionDep,
    settings: SettingsDep,
    _current_user: CurrentUserDep,
) -> Envelope[ChatProfileRead]:
    """返回当前聊天 provider 与模型。"""
    settings_record = SettingsService(session, settings).get_or_create_settings_record()
    return Envelope(success=True, data=to_chat_profile_read(settings_record), error=None)


@router.post(
    "/sessions",
    response_model=Envelope[ChatSessionRead],
    status_code=status.HTTP_201_CREATED,
)
def create_session(
    payload: CreateChatSessionRequest,
    session: DbSessionDep,
    current_user: CurrentUserDep,
) -> Envelope[ChatSessionRead]:
    """创建会话。"""
    chat_session = ChatApplicationService(
        session,
        settings=None,
    ).create_session(
        current_user,
        payload.title,
        reasoning_mode=payload.reasoning_mode,
    )
    return Envelope(success=True, data=to_chat_session_read(chat_session), error=None)


@router.delete("/sessions/{session_id}", response_model=Envelope[DeleteChatSessionResult])
def delete_session(
    session_id: int,
    session: DbSessionDep,
    current_user: CurrentUserDep,
) -> Envelope[DeleteChatSessionResult]:
    """删除会话。"""
    service = ChatApplicationService(session, settings=None)
    service.delete_session(current_user, session_id)
    return Envelope(success=True, data=DeleteChatSessionResult(deleted=True), error=None)


@router.get("/sessions", response_model=Envelope[list[ChatSessionRead]])
def list_sessions(
    session: DbSessionDep,
    current_user: CurrentUserDep,
) -> Envelope[list[ChatSessionRead]]:
    """列出会话。"""
    chat_sessions = ChatApplicationService(
        session,
        settings=None,
    ).list_sessions(current_user)
    return Envelope(
        success=True,
        data=[to_chat_session_read(item) for item in chat_sessions],
        error=None,
    )


@router.patch("/sessions/{session_id}", response_model=Envelope[ChatSessionRead])
def update_session(
    session_id: int,
    payload: UpdateChatSessionRequest,
    session: DbSessionDep,
    current_user: CurrentUserDep,
) -> Envelope[ChatSessionRead]:
    """更新会话。"""
    service = ChatApplicationService(session, settings=None)
    chat_session = service.update_session(
        current_user,
        session_id,
        payload.model_dump(exclude_unset=True),
    )
    return Envelope(success=True, data=to_chat_session_read(chat_session), error=None)


@router.get("/sessions/{session_id}/messages", response_model=Envelope[list[ChatMessageRead]])
def list_messages(
    session_id: int,
    session: DbSessionDep,
    current_user: CurrentUserDep,
    before_id: int | None = Query(default=None, ge=1),
    limit: int | None = Query(default=None, ge=1, le=200),
) -> Envelope[list[ChatMessageRead]]:
    """列出消息。"""
    service = ChatApplicationService(session, settings=None)
    messages = (
        service.list_messages_window(
            current_user,
            session_id,
            before_id=before_id,
            limit=limit,
        )
        if limit is not None
        else service.list_messages(current_user, session_id)
    )
    attachments_by_message_id = service.list_attachments_for_message_ids(
        [message.id for message in messages]
    )
    return Envelope(
        success=True,
        data=[
            to_chat_message_read(item, attachments_by_message_id.get(item.id)) for item in messages
        ],
        error=None,
    )


@router.get("/sessions/{session_id}/context", response_model=Envelope[ChatSessionContextRead])
def get_session_context(
    session_id: int,
    session: DbSessionDep,
    current_user: CurrentUserDep,
) -> Envelope[ChatSessionContextRead]:
    """返回聊天右栏所需的紧凑上下文。"""
    service = ChatApplicationService(session, settings=None)
    context = service.get_session_context(current_user, session_id)
    return Envelope(success=True, data=to_chat_session_context_read(context), error=None)


@router.delete("/messages/{message_id}", response_model=Envelope[DeleteChatMessageResult])
def delete_message(
    message_id: int,
    session: DbSessionDep,
    current_user: CurrentUserDep,
) -> Envelope[DeleteChatMessageResult]:
    """删除消息。"""
    service = ChatApplicationService(session, settings=None)
    service.delete_failed_message(current_user, message_id)
    return Envelope(success=True, data=DeleteChatMessageResult(deleted=True), error=None)


@router.post(
    "/messages/{message_id}/attachments/{attachment_id}/archive",
    response_model=Envelope[ChatMessageRead],
)
def archive_message_attachment(
    message_id: int,
    attachment_id: str,
    payload: ArchiveChatAttachmentRequest,
    session: DbSessionDep,
    current_user: CurrentUserDep,
) -> Envelope[ChatMessageRead]:
    """归档消息附件。"""
    service = ChatApplicationService(session, settings=None)
    message = service.archive_message_attachment(
        current_user,
        message_id,
        attachment_id,
        payload.document_revision_id,
    )
    return Envelope(
        success=True,
        data=to_chat_message_read(message, service.list_attachments(message.id)),
        error=None,
    )


@router.post("/sessions/{session_id}/messages", response_model=Envelope[ChatMessagePairRead])
def create_message(
    session_id: int,
    payload: CreateChatMessageRequest,
    session: DbSessionDep,
    settings: SettingsDep,
    current_user: CurrentUserDep,
) -> Envelope[ChatMessagePairRead]:
    """创建消息。"""
    service = ChatApplicationService(session, settings)
    user_message, assistant_message = service.create_message(current_user, session_id, payload)
    attachments_by_message_id = service.list_attachments_for_message_ids(
        [user_message.id, assistant_message.id]
    )

    return Envelope(
        success=True,
        data=ChatMessagePairRead(
            user_message=to_chat_message_read(
                user_message,
                attachments_by_message_id.get(user_message.id),
            ),
            assistant_message=to_chat_message_read(
                assistant_message,
                attachments_by_message_id.get(assistant_message.id),
            ),
        ),
        error=None,
    )


@router.post(
    "/sessions/{session_id}/messages/stream",
    response_class=EventSourceResponse,
    responses=CHAT_STREAM_RESPONSES,
)
def create_message_stream(
    session_id: int,
    payload: CreateChatMessageRequest,
    session: DbSessionDep,
    settings: SettingsDep,
    current_user: CurrentUserDep,
):
    service = ChatApplicationService(session, settings)
    presenter, chat_run_service = service.create_stream_components(current_user, session_id)

    return EventSourceResponse(
        stream_presented_events(
            chat_run_service.stream_run(
                session_id=session_id,
                content=payload.content,
                attachments=(
                    [attachment.model_dump() for attachment in payload.attachments]
                    if payload.attachments
                    else None
                ),
                client_request_id=payload.client_request_id,
                retry_of_message_id=payload.retry_of_message_id,
            ),
            presenter,
        ),
        ping=15,
    )


@router.post(
    "/sessions/{session_id}/messages/stream/cancel",
    response_model=Envelope[CancelChatRunResult],
)
def cancel_pending_stream(
    session_id: int,
    payload: CancelChatStreamRequest,
    session: DbSessionDep,
    settings: SettingsDep,
    current_user: CurrentUserDep,
) -> Envelope[CancelChatRunResult]:
    """按 client_request_id 取消仍在启动中的流式聊天请求。"""
    service = ChatApplicationService(session, settings)
    cancelled = service.cancel_run_by_client_request(
        current_user,
        session_id,
        payload.client_request_id,
    )
    return Envelope(
        success=True,
        data=CancelChatRunResult(cancelled=cancelled),
        error=None,
    )


@router.get("/runs/active", response_model=Envelope[list[ActiveChatRunRead]])
def list_active_runs(
    session: DbSessionDep,
    current_user: CurrentUserDep,
) -> Envelope[list[ActiveChatRunRead]]:
    """列出活跃的聊天运行。"""
    runs = ChatApplicationService(session, settings=None).list_active_runs(current_user)
    return Envelope(
        success=True,
        data=[to_active_chat_run_read(run) for run in runs],
        error=None,
    )


@router.get("/runs/{run_id}", response_model=Envelope[ChatRunRead])
def get_run(
    run_id: int,
    session: DbSessionDep,
    current_user: CurrentUserDep,
) -> Envelope[ChatRunRead]:
    """获取运行。"""
    service = ChatApplicationService(session, settings=None)
    run = service.get_run(current_user, run_id)
    return Envelope(success=True, data=to_chat_run_read(run), error=None)


@router.post("/runs/{run_id}/cancel", response_model=Envelope[CancelChatRunResult])
def cancel_run(
    run_id: int,
    session: DbSessionDep,
    settings: SettingsDep,
    current_user: CurrentUserDep,
) -> Envelope[CancelChatRunResult]:
    """取消一个仍在运行中的聊天 run。"""
    service = ChatApplicationService(session, settings)
    cancelled = service.cancel_run(current_user, run_id)
    return Envelope(
        success=True,
        data=CancelChatRunResult(cancelled=cancelled),
        error=None,
    )


@router.get("/runs/{run_id}/events", response_model=Envelope[list[ChatRunEventRead]])
def list_run_events(
    run_id: int,
    session: DbSessionDep,
    current_user: CurrentUserDep,
) -> Envelope[list[ChatRunEventRead]]:
    """获取运行事件。"""
    service = ChatApplicationService(session, settings=None)
    run = service.get_run(current_user, run_id)
    events = service.list_run_events(run.id)
    return Envelope(
        success=True,
        data=[model_to_read_simple(event, ChatRunEventRead) for event in events],
        error=None,
    )
