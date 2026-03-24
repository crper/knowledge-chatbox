"""聊天仓储数据访问实现。"""

from __future__ import annotations

from sqlalchemy import delete, select
from sqlalchemy.orm import Session

from knowledge_chatbox_api.models.chat import ChatMessage, ChatMessageAttachment, ChatSession
from knowledge_chatbox_api.models.document import DocumentRevision
from knowledge_chatbox_api.repositories.space_repository import SpaceRepository

_UNSET = object()


class ChatRepository:
    """封装聊天会话、消息与附件的数据库访问。"""

    def __init__(self, session: Session) -> None:
        self.session = session
        self.space_repository = SpaceRepository(session)

    def create_session(
        self,
        user_id: int,
        title: str | None = None,
        *,
        reasoning_mode: str = "default",
    ) -> ChatSession:
        """创建会话。"""
        space = self.space_repository.ensure_personal_space(
            user_id=user_id,
        )
        chat_session = ChatSession(
            space_id=space.id,
            user_id=user_id,
            title=title,
            reasoning_mode=reasoning_mode,
        )
        self.session.add(chat_session)
        self.session.flush()
        return chat_session

    def list_sessions(self, user_id: int) -> list[ChatSession]:
        """列出Sessions。"""
        statement = (
            select(ChatSession)
            .where(ChatSession.user_id == user_id)
            .order_by(ChatSession.updated_at.desc(), ChatSession.id.desc())
        )
        return list(self.session.scalars(statement).all())

    def get_session(self, session_id: int) -> ChatSession | None:
        """获取会话。"""
        return self.session.get(ChatSession, session_id)

    def update_session(
        self,
        session_id: int,
        *,
        title: str | None | object = _UNSET,
        reasoning_mode: str | object = _UNSET,
    ) -> ChatSession | None:
        """更新会话元信息。"""
        chat_session = self.get_session(session_id)
        if chat_session is None:
            return None
        if title is None or isinstance(title, str):
            chat_session.title = title
        if reasoning_mode is not _UNSET and isinstance(reasoning_mode, str):
            chat_session.reasoning_mode = reasoning_mode
        self.session.flush()
        return chat_session

    def delete_session(self, session_id: int) -> None:
        """删除会话。"""
        self.session.execute(delete(ChatMessage).where(ChatMessage.session_id == session_id))
        self.session.execute(delete(ChatSession).where(ChatSession.id == session_id))

    def get_message(self, message_id: int) -> ChatMessage | None:
        """获取消息。"""
        return self.session.get(ChatMessage, message_id)

    def get_user_message_by_client_request_id(
        self,
        *,
        session_id: int,
        client_request_id: str,
    ) -> ChatMessage | None:
        """按会话和请求幂等键获取用户消息。"""
        statement = select(ChatMessage).where(
            ChatMessage.session_id == session_id,
            ChatMessage.role == "user",
            ChatMessage.client_request_id == client_request_id,
        )
        return self.session.scalar(statement)

    def create_message(
        self,
        *,
        attachments: list[dict] | None = None,
        session_id: int,
        role: str,
        content: str,
        status: str,
        client_request_id: str | None = None,
        error_message: str | None = None,
        retry_of_message_id: int | None = None,
        reply_to_message_id: int | None = None,
        sources_json: list[dict] | None = None,
    ) -> ChatMessage:
        """创建消息。"""
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
        """列出附件。"""
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
        """按消息批量列出附件。"""
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

    def list_messages(self, session_id: int) -> list[ChatMessage]:
        """列出消息。"""
        statement = (
            select(ChatMessage)
            .where(ChatMessage.session_id == session_id)
            .order_by(ChatMessage.id.asc())
        )
        return list(self.session.scalars(statement).all())

    def list_recent_messages(self, session_id: int, *, limit: int) -> list[ChatMessage]:
        """按时间顺序返回最近 N 条消息。"""
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
        """获取AssistantReply。"""
        statement = (
            select(ChatMessage)
            .where(
                ChatMessage.reply_to_message_id == reply_to_message_id,
                ChatMessage.role == "assistant",
            )
            .order_by(ChatMessage.id.desc())
        )
        return self.session.scalars(statement).first()

    def list_assistant_replies(self, reply_to_message_id: int) -> list[ChatMessage]:
        """列出AssistantReplies。"""
        statement = (
            select(ChatMessage)
            .where(
                ChatMessage.reply_to_message_id == reply_to_message_id,
                ChatMessage.role == "assistant",
            )
            .order_by(ChatMessage.id.asc())
        )
        return list(self.session.scalars(statement).all())

    def delete_message(self, message_id: int) -> None:
        """删除消息。"""
        self.session.execute(delete(ChatMessage).where(ChatMessage.id == message_id))

    def delete_sessions_by_user_id(self, user_id: int) -> None:
        """删除SessionsBy用户Id。"""
        session_ids = list(
            self.session.scalars(select(ChatSession.id).where(ChatSession.user_id == user_id)).all()
        )
        if not session_ids:
            return
        self.session.execute(delete(ChatSession).where(ChatSession.id.in_(session_ids)))
