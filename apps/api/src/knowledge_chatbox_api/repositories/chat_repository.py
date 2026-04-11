from typing import Any

from sqlalchemy import delete, select
from sqlalchemy.orm import Session

from knowledge_chatbox_api.models.chat import ChatMessage, ChatMessageAttachment, ChatSession
from knowledge_chatbox_api.models.document import DocumentRevision
from knowledge_chatbox_api.models.enums import ChatMessageRole, ReasoningMode
from knowledge_chatbox_api.repositories.base import BaseRepository
from knowledge_chatbox_api.repositories.space_repository import SpaceRepository

UNSET = object()


class ChatRepository(BaseRepository[ChatSession]):
    model_type = ChatSession

    def __init__(self, session: Session) -> None:
        super().__init__(session=session)
        self.space_repository = SpaceRepository(session)

    def create_session(
        self,
        user_id: int,
        title: str | None = None,
        *,
        reasoning_mode: str = ReasoningMode.DEFAULT,
    ) -> ChatSession:
        space = self.space_repository.ensure_personal_space(
            user_id=user_id,
        )
        chat_session = ChatSession(
            space_id=space.id,
            user_id=user_id,
            title=title,
            reasoning_mode=reasoning_mode,
        )
        return self.add(chat_session)

    def list_sessions(self, user_id: int) -> list[ChatSession]:
        statement = (
            select(ChatSession)
            .where(ChatSession.user_id == user_id)
            .order_by(ChatSession.updated_at.desc(), ChatSession.id.desc())
        )
        return list(self.session.scalars(statement).all())

    def get_session(self, session_id: int) -> ChatSession | None:
        return self.get_one_or_none(id=session_id)

    def update_session(
        self,
        session_id: int,
        *,
        title: str | None | object = UNSET,
        reasoning_mode: str | object = UNSET,
    ) -> ChatSession | None:
        chat_session = self.get_session(session_id)
        if chat_session is None:
            return None
        if title is not UNSET:
            chat_session.title = title  # type: ignore[assignment]  # UNSET sentinel 允许传入 None 清空字段
        if reasoning_mode is not UNSET:
            chat_session.reasoning_mode = reasoning_mode  # type: ignore[assignment]
        self.session.flush()
        return chat_session

    def delete_session(self, session_id: int) -> None:
        self.session.execute(delete(ChatMessage).where(ChatMessage.session_id == session_id))
        self.session.execute(delete(ChatSession).where(ChatSession.id == session_id))

    def get_message(self, message_id: int) -> ChatMessage | None:
        return self.session.get(ChatMessage, message_id)

    def get_user_message_by_client_request_id(
        self,
        *,
        session_id: int,
        client_request_id: str,
    ) -> ChatMessage | None:
        statement = select(ChatMessage).where(
            ChatMessage.session_id == session_id,
            ChatMessage.role == ChatMessageRole.USER,
            ChatMessage.client_request_id == client_request_id,
        )
        return self.session.scalar(statement)

    def create_message(
        self,
        *,
        attachments: list[dict[str, Any]] | None = None,
        session_id: int,
        role: str,
        content: str,
        status: str,
        client_request_id: str | None = None,
        error_message: str | None = None,
        retry_of_message_id: int | None = None,
        reply_to_message_id: int | None = None,
        sources_json: list[dict[str, Any]] | None = None,
    ) -> ChatMessage:
        message = ChatMessage(
            session_id=session_id,
            role=role,
            content=content,
            status=status,
            client_request_id=client_request_id,
            error_message=error_message,
            retry_of_message_id=retry_of_message_id,
            reply_to_message_id=reply_to_message_id,
            sources_json=sources_json,
        )
        self.session.add(message)
        self.session.flush()
        for attachment in attachments or []:
            self.session.add(
                ChatMessageAttachment(
                    message_id=message.id,
                    attachment_id=attachment["attachment_id"],
                    type=attachment["type"],
                    name=attachment["name"],
                    mime_type=attachment["mime_type"],
                    size_bytes=attachment["size_bytes"],
                    document_revision_id=attachment.get("document_revision_id"),
                    archived_at=attachment.get("archived_at"),
                )
            )
        self.session.flush()
        return message

    def list_attachments(self, message_id: int) -> list[ChatMessageAttachment]:
        statement = (
            select(ChatMessageAttachment)
            .where(ChatMessageAttachment.message_id == message_id)
            .order_by(ChatMessageAttachment.id.asc())
        )
        attachments = list(self.session.scalars(statement).all())
        self._attach_document_ids(attachments)
        return attachments

    def list_attachments_for_message_ids(
        self,
        message_ids: list[int],
    ) -> dict[int, list[ChatMessageAttachment]]:
        if not message_ids:
            return {}

        statement = (
            select(ChatMessageAttachment)
            .where(ChatMessageAttachment.message_id.in_(message_ids))
            .order_by(ChatMessageAttachment.message_id.asc(), ChatMessageAttachment.id.asc())
        )
        attachments_by_message_id: dict[int, list[ChatMessageAttachment]] = {
            message_id: [] for message_id in message_ids
        }
        attachments = list(self.session.scalars(statement).all())
        self._attach_document_ids(attachments)
        for attachment in attachments:
            attachments_by_message_id.setdefault(attachment.message_id, []).append(attachment)
        return attachments_by_message_id

    def list_session_attachments(self, session_id: int) -> list[ChatMessageAttachment]:
        statement = (
            select(ChatMessageAttachment)
            .join(ChatMessage, ChatMessage.id == ChatMessageAttachment.message_id)
            .where(ChatMessage.session_id == session_id)
            .order_by(ChatMessage.id.asc(), ChatMessageAttachment.id.asc())
        )
        attachments = list(self.session.scalars(statement).all())
        self._attach_document_ids(attachments)
        return attachments

    def _attach_document_ids(self, attachments: list[ChatMessageAttachment]) -> None:
        revision_ids = {
            attachment.document_revision_id
            for attachment in attachments
            if attachment.document_revision_id is not None
        }
        if not revision_ids:
            return
        revisions = {
            revision.id: revision
            for revision in self.session.scalars(
                select(DocumentRevision).where(DocumentRevision.id.in_(revision_ids))
            ).all()
        }
        for attachment in attachments:
            revision = revisions.get(attachment.document_revision_id or -1)
            attachment.document_id = revision.document_id if revision is not None else None

    def list_messages(self, session_id: int, *, limit: int = 500) -> list[ChatMessage]:
        statement = (
            select(ChatMessage)
            .where(ChatMessage.session_id == session_id)
            .order_by(ChatMessage.id.asc())
            .limit(limit)
        )
        return list(self.session.scalars(statement).all())

    def list_messages_window(
        self,
        session_id: int,
        *,
        before_id: int | None,
        limit: int,
    ) -> list[ChatMessage]:
        statement = select(ChatMessage).where(ChatMessage.session_id == session_id)
        if before_id is not None:
            statement = statement.where(ChatMessage.id < before_id)
        statement = statement.order_by(ChatMessage.id.desc()).limit(limit)
        messages = list(self.session.scalars(statement).all())
        messages.reverse()
        return messages

    def get_latest_assistant_message(self, session_id: int) -> ChatMessage | None:
        statement = (
            select(ChatMessage)
            .where(
                ChatMessage.session_id == session_id,
                ChatMessage.role == ChatMessageRole.ASSISTANT,
            )
            .order_by(ChatMessage.id.desc())
        )
        return self.session.scalars(statement).first()

    def list_recent_messages(self, session_id: int, *, limit: int) -> list[ChatMessage]:
        if limit <= 0:
            return []
        statement = (
            select(ChatMessage)
            .where(ChatMessage.session_id == session_id)
            .order_by(ChatMessage.id.desc())
            .limit(limit)
        )
        messages = list(self.session.scalars(statement).all())
        messages.reverse()
        return messages

    def get_assistant_reply(self, reply_to_message_id: int) -> ChatMessage | None:
        statement = (
            select(ChatMessage)
            .where(
                ChatMessage.reply_to_message_id == reply_to_message_id,
                ChatMessage.role == ChatMessageRole.ASSISTANT,
            )
            .order_by(ChatMessage.id.desc())
        )
        return self.session.scalars(statement).first()

    def list_assistant_replies(self, reply_to_message_id: int) -> list[ChatMessage]:
        statement = (
            select(ChatMessage)
            .where(
                ChatMessage.reply_to_message_id == reply_to_message_id,
                ChatMessage.role == ChatMessageRole.ASSISTANT,
            )
            .order_by(ChatMessage.id.asc())
        )
        return list(self.session.scalars(statement).all())

    def delete_message(self, message_id: int) -> None:
        self.session.execute(delete(ChatMessage).where(ChatMessage.id == message_id))

    def delete_sessions_by_user_id(self, user_id: int) -> None:
        self.session.execute(delete(ChatSession).where(ChatSession.user_id == user_id))
