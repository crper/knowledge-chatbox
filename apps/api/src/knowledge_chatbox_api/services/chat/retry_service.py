"""聊天相关服务模块。"""

from __future__ import annotations

from knowledge_chatbox_api.repositories.chat_repository import ChatRepository


class RetryTargetNotFoundError(Exception):
    """表示重试目标消息不存在或不可重试。"""


class DuplicateClientRequestConflictError(Exception):
    """表示幂等键已被不同请求载荷占用。"""


class RetryService:
    """封装失败消息重试与去重逻辑。"""

    def __init__(self, repository: ChatRepository, session) -> None:
        self.repository = repository
        self.session = session

    def create_or_reuse_user_message(
        self,
        *,
        attachments: list[dict] | None = None,
        session_id: int,
        content: str,
        client_request_id: str,
    ):
        """创建OrReuse用户消息。"""
        message = self.repository.get_user_message_by_client_request_id(
            session_id=session_id,
            client_request_id=client_request_id,
        )
        if message is not None:
            if self._matches_existing_message(
                message_id=message.id,
                content=content,
                attachments=attachments,
            ):
                return message
            raise DuplicateClientRequestConflictError(
                "client_request_id already exists for a different message payload."
            )

        return self.repository.create_message(
            attachments=attachments,
            session_id=session_id,
            role="user",
            content=content,
            status="succeeded",
            client_request_id=client_request_id,
        )

    def retry_user_message(
        self,
        *,
        session_id: int,
        content: str,
        client_request_id: str,
        retry_of_message_id: int,
    ):
        """处理重试用户消息相关逻辑。"""
        original_message = self.repository.get_message(retry_of_message_id)
        if (
            original_message is None
            or original_message.session_id != session_id
            or original_message.role != "user"
        ):
            raise RetryTargetNotFoundError("Retry target not found.")

        del content
        original_attachments = [
            {
                "attachment_id": attachment.attachment_id,
                "type": attachment.type,
                "name": attachment.name,
                "mime_type": attachment.mime_type,
                "size_bytes": attachment.size_bytes,
                "document_revision_id": attachment.document_revision_id,
                "archived_at": attachment.archived_at,
            }
            for attachment in self.repository.list_attachments(original_message.id)
        ]
        existing_message = self.repository.get_user_message_by_client_request_id(
            session_id=session_id,
            client_request_id=client_request_id,
        )
        if existing_message is not None:
            if self._matches_existing_message(
                message_id=existing_message.id,
                content=original_message.content,
                attachments=original_attachments,
                retry_of_message_id=retry_of_message_id,
            ):
                return existing_message
            raise DuplicateClientRequestConflictError(
                "client_request_id already exists for a different retry payload."
            )
        return self.repository.create_message(
            attachments=original_attachments,
            session_id=session_id,
            role="user",
            content=original_message.content,
            status="succeeded",
            client_request_id=client_request_id,
            retry_of_message_id=retry_of_message_id,
        )

    def create_assistant_reply(
        self,
        *,
        session_id: int,
        reply_to_message_id: int,
        content: str,
    ):
        """创建AssistantReply。"""
        return self.repository.create_message(
            session_id=session_id,
            role="assistant",
            content=content,
            status="pending",
            reply_to_message_id=reply_to_message_id,
        )

    def _matches_existing_message(
        self,
        *,
        message_id: int,
        content: str,
        attachments: list[dict] | None,
        retry_of_message_id: int | None = None,
    ) -> bool:
        existing_message = self.repository.get_message(message_id)
        if existing_message is None:
            return False

        return (
            content == existing_message.content
            and retry_of_message_id == existing_message.retry_of_message_id
            and self._normalize_attachments(attachments)
            == self._normalize_attachments(self._serialize_attachments(message_id))
        )

    def _serialize_attachments(self, message_id: int) -> list[dict]:
        return [
            {
                "attachment_id": attachment.attachment_id,
                "type": attachment.type,
                "name": attachment.name,
                "mime_type": attachment.mime_type,
                "size_bytes": attachment.size_bytes,
                "document_revision_id": attachment.document_revision_id,
                "archived_at": attachment.archived_at,
            }
            for attachment in self.repository.list_attachments(message_id)
        ]

    def _normalize_attachments(self, attachments: list[dict] | None) -> list[dict]:
        normalized: list[dict] = []
        for attachment in attachments or []:
            normalized.append(
                {
                    "attachment_id": attachment["attachment_id"],
                    "type": attachment["type"],
                    "name": attachment["name"],
                    "mime_type": attachment["mime_type"],
                    "size_bytes": attachment["size_bytes"],
                    "document_revision_id": attachment.get("document_revision_id"),
                    "archived_at": attachment.get("archived_at"),
                }
            )
        return normalized
