"""聊天相关服务模块。"""

from typing import Any

from knowledge_chatbox_api.core.errors import AppError
from knowledge_chatbox_api.models.enums import (
    ChatAttachmentType,
    ChatMessageRole,
    ChatMessageStatus,
)
from knowledge_chatbox_api.repositories.chat_repository import ChatRepository
from knowledge_chatbox_api.schemas.chat import ChatAttachmentMetadata


class RetryTargetNotFoundError(AppError):
    """表示重试目标消息不存在或不可重试。"""

    status_code = 404
    code = "chat_message_not_found"
    default_message = "Retry target not found."


class DuplicateClientRequestConflictError(AppError):
    """表示幂等键已被不同请求载荷占用。"""

    status_code = 409
    code = "chat_message_conflict"
    default_message = "client_request_id already exists for a different message payload."


class RetryService:
    """封装失败消息重试与去重逻辑。"""

    def __init__(self, repository: ChatRepository) -> None:
        self.repository = repository

    def create_or_reuse_user_message(
        self,
        *,
        attachments: list[dict[str, Any]] | None = None,
        session_id: int,
        content: str,
        client_request_id: str,
    ):
        """创建新用户消息或返回已有消息。"""
        message = self.repository.get_user_message_by_client_request_id(
            session_id=session_id,
            client_request_id=client_request_id,
        )
        if message is not None:
            if self._matches_existing_message(
                existing_message=message,
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
            role=ChatMessageRole.USER,
            content=content,
            status=ChatMessageStatus.SUCCEEDED,
            client_request_id=client_request_id,
        )

    def retry_user_message(
        self,
        *,
        session_id: int,
        client_request_id: str,
        retry_of_message_id: int,
    ):
        """重试用户消息。"""
        original_message = self.repository.get_message(retry_of_message_id)
        if (
            original_message is None
            or original_message.session_id != session_id
            or original_message.role != ChatMessageRole.USER
        ):
            raise RetryTargetNotFoundError("Retry target not found.")

        original_attachments = self._serialize_attachments(original_message.id)
        existing_message = self.repository.get_user_message_by_client_request_id(
            session_id=session_id,
            client_request_id=client_request_id,
        )
        if existing_message is not None:
            if self._matches_existing_message(
                existing_message=existing_message,
                content=original_message.content,
                attachments=original_attachments,
                retry_of_message_id=retry_of_message_id,
            ):
                return existing_message
            raise DuplicateClientRequestConflictError(
                "client_request_id already exists for a different retry payload."
            )
        return self.repository.create_message(
            attachments=self._to_dicts(original_attachments),
            session_id=session_id,
            role=ChatMessageRole.USER,
            content=original_message.content,
            status=ChatMessageStatus.SUCCEEDED,
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
        """创建助手回复消息。"""
        return self.repository.create_message(
            session_id=session_id,
            role=ChatMessageRole.ASSISTANT,
            content=content,
            status=ChatMessageStatus.PENDING,
            reply_to_message_id=reply_to_message_id,
        )

    def _matches_existing_message(
        self,
        *,
        existing_message: Any,
        content: str,
        attachments: list[ChatAttachmentMetadata] | list[dict[str, Any]] | None,
        retry_of_message_id: int | None = None,
    ) -> bool:
        if existing_message is None:
            return False

        incoming = self._normalize_attachments(attachments)
        existing = self._serialize_attachments(existing_message.id)

        return (
            content == existing_message.content
            and retry_of_message_id == existing_message.retry_of_message_id
            and incoming == existing
        )

    def _serialize_attachments(self, message_id: int) -> list[ChatAttachmentMetadata]:
        """将 ORM 附件对象转换为 ChatAttachmentMetadata 列表。"""
        return [
            ChatAttachmentMetadata(
                attachment_id=attachment.attachment_id,
                type=ChatAttachmentType(attachment.type),
                name=attachment.name,
                mime_type=attachment.mime_type,
                size_bytes=attachment.size_bytes,
                document_revision_id=attachment.document_revision_id,
                archived_at=attachment.archived_at,
            )
            for attachment in self.repository.list_attachments(message_id)
        ]

    def _normalize_attachments(
        self,
        attachments: list[ChatAttachmentMetadata] | list[dict[str, Any]] | None,
    ) -> list[ChatAttachmentMetadata]:
        """将各种附件输入格式统一为 ChatAttachmentMetadata 列表。"""
        if not attachments:
            return []
        if isinstance(attachments[0], ChatAttachmentMetadata):
            return attachments
        return [ChatAttachmentMetadata.model_validate(a) for a in attachments]

    @staticmethod
    def _to_dicts(attachments: list[ChatAttachmentMetadata]) -> list[dict[str, Any]]:
        """将 ChatAttachmentMetadata 列表转换为 dict 列表，用于 repository 接口。"""
        return [a.model_dump() for a in attachments]
