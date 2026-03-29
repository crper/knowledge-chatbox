"""聊天路由定义。"""

from __future__ import annotations

from collections.abc import Iterable
from typing import cast

from fastapi import APIRouter, status
from fastapi.responses import StreamingResponse

from knowledge_chatbox_api.api.deps import CurrentUserDep, DbSessionDep, SettingsDep
from knowledge_chatbox_api.api.error_responses import CHAT_STREAM_RESPONSES
from knowledge_chatbox_api.models.chat import ChatMessageAttachment
from knowledge_chatbox_api.schemas.chat import (
    ActiveChatRunRead,
    ArchiveChatAttachmentRequest,
    ChatAttachmentMetadata,
    ChatAttachmentType,
    ChatMessagePairRead,
    ChatMessageRead,
    ChatProfileRead,
    ChatRunEventRead,
    ChatRunRead,
    ChatSessionContextRead,
    ChatSessionRead,
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
from knowledge_chatbox_api.services.settings.settings_service import SettingsService

router = APIRouter(prefix="/api/chat", tags=["chat"])


def stream_presented_events(events, presenter):
    """把聊天事件转换成 SSE，并确保外层关闭时内层流也会关闭。"""
    try:
        for event in events:
            yield presenter.to_sse(event)
    finally:
        close = getattr(events, "close", None)
        if callable(close):
            close()


def to_chat_session_read(chat_session) -> ChatSessionRead:
    """把会话模型转换为会话响应结构。"""
    return ChatSessionRead.model_validate(chat_session, from_attributes=True)


def _build_chat_attachment_payloads(
    attachments: Iterable[ChatMessageAttachment] | None,
) -> list[ChatAttachmentMetadata] | None:
    """构建聊天附件响应载荷。"""
    if not attachments:
        return None
    return [
        ChatAttachmentMetadata(
            attachment_id=attachment.attachment_id,
            type=cast(ChatAttachmentType, attachment.type),
            name=attachment.name,
            mime_type=attachment.mime_type,
            size_bytes=attachment.size_bytes,
            document_id=getattr(attachment, "document_id", None),
            document_revision_id=attachment.document_revision_id,
            archived_at=attachment.archived_at,
        )
        for attachment in attachments
    ]


def to_chat_message_read(
    message,
    attachments: Iterable[ChatMessageAttachment] | None = None,
) -> ChatMessageRead:
    """把消息模型转换为消息响应结构。"""
    return ChatMessageRead(
        attachments_json=_build_chat_attachment_payloads(attachments),
        id=message.id,
        session_id=message.session_id,
        role=message.role,
        content=message.content,
        status=message.status,
        client_request_id=message.client_request_id,
        error_message=message.error_message,
        retry_of_message_id=message.retry_of_message_id,
        reply_to_message_id=message.reply_to_message_id,
        sources_json=message.sources_json,
        created_at=message.created_at,
    )


def to_chat_session_context_read(input: dict) -> ChatSessionContextRead:
    """把右栏 context 数据转换为响应结构。"""
    return ChatSessionContextRead(
        session_id=input["session_id"],
        attachment_count=input["attachment_count"],
        attachments=_build_chat_attachment_payloads(input["attachments"]) or [],
        latest_assistant_message_id=input["latest_assistant_message_id"],
        latest_assistant_sources=input["latest_assistant_sources"],
    )


def to_chat_run_read(chat_run) -> ChatRunRead:
    """把运行记录模型转换为运行响应结构。"""
    return ChatRunRead.model_validate(chat_run, from_attributes=True)


def to_active_chat_run_read(chat_run) -> ActiveChatRunRead:
    """把运行记录模型转换为活动运行响应结构。"""
    return ActiveChatRunRead.model_validate(chat_run, from_attributes=True)


def to_chat_profile_read(settings_record) -> ChatProfileRead:
    """把设置记录转换为当前聊天配置结构。"""
    return ChatProfileRead(
        provider=settings_record.response_provider,
        model=settings_record.response_model,
        configured=_is_response_provider_configured(settings_record),
    )


def _is_response_provider_configured(settings_record) -> bool:
    provider = settings_record.response_provider
    model = (settings_record.response_model or "").strip()
    if not model:
        return False

    profiles = settings_record.provider_profiles
    if provider == "anthropic":
        return bool((profiles.anthropic.api_key or "").strip())
    if provider == "ollama":
        return bool((profiles.ollama.base_url or "").strip())
    return bool((profiles.openai.api_key or "").strip())


@router.get("/profile", response_model=Envelope[ChatProfileRead])
def get_chat_profile(
    session: DbSessionDep,
    settings: SettingsDep,
    current_user: CurrentUserDep,
) -> Envelope[ChatProfileRead]:
    """返回当前聊天 provider 与模型。"""
    del current_user
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
    """列出Sessions。"""
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
) -> Envelope[list[ChatMessageRead]]:
    """列出消息。"""
    service = ChatApplicationService(session, settings=None)
    messages = service.list_messages(current_user, session_id)
    attachments_by_message_id = service.chat_repository.list_attachments_for_message_ids(
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
        data=to_chat_message_read(message, service.chat_repository.list_attachments(message.id)),
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
    attachments_by_message_id = service.chat_repository.list_attachments_for_message_ids(
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
    response_class=StreamingResponse,
    responses=CHAT_STREAM_RESPONSES,
)
def create_message_stream(
    session_id: int,
    payload: CreateChatMessageRequest,
    session: DbSessionDep,
    settings: SettingsDep,
    current_user: CurrentUserDep,
):
    """创建消息流式。"""
    service = ChatApplicationService(session, settings)
    presenter, chat_run_service = service.create_stream_components(current_user, session_id)

    return StreamingResponse(
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
        media_type="text/event-stream",
    )


@router.get("/runs/active", response_model=Envelope[list[ActiveChatRunRead]])
def list_active_runs(
    session: DbSessionDep,
    current_user: CurrentUserDep,
) -> Envelope[list[ActiveChatRunRead]]:
    """列出活跃Runs。"""
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


@router.get("/runs/{run_id}/events", response_model=Envelope[list[ChatRunEventRead]])
def list_run_events(
    run_id: int,
    session: DbSessionDep,
    current_user: CurrentUserDep,
) -> Envelope[list[ChatRunEventRead]]:
    """获取运行事件。"""
    service = ChatApplicationService(session, settings=None)
    run = service.get_run(current_user, run_id)
    events = service.chat_run_event_repository.list_for_run(run.id)
    return Envelope(
        success=True,
        data=[ChatRunEventRead.model_validate(event, from_attributes=True) for event in events],
        error=None,
    )
