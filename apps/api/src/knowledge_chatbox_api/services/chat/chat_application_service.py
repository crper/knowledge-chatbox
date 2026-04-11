"""Application-layer orchestration for chat routes."""

from datetime import UTC, datetime
from typing import Any

from sqlalchemy.orm import Session

from knowledge_chatbox_api.core.config import Settings
from knowledge_chatbox_api.core.errors import AppError
from knowledge_chatbox_api.core.logging import get_logger
from knowledge_chatbox_api.models.auth import User
from knowledge_chatbox_api.models.chat import ChatMessage, ChatSession
from knowledge_chatbox_api.models.enums import (
    ChatMessageRole,
    ChatMessageStatus,
    ReasoningMode,
)
from knowledge_chatbox_api.providers.factory import build_embedding_adapter_from_settings
from knowledge_chatbox_api.repositories.chat_repository import _UNSET, ChatRepository
from knowledge_chatbox_api.repositories.chat_run_event_repository import ChatRunEventRepository
from knowledge_chatbox_api.repositories.chat_run_repository import ChatRunRepository
from knowledge_chatbox_api.repositories.document_repository import DocumentRepository
from knowledge_chatbox_api.schemas.chat import CreateChatMessageRequest, dump_chat_attachments
from knowledge_chatbox_api.services.chat.chat_run_service import ChatRunService
from knowledge_chatbox_api.services.chat.chat_stream_presenter import ChatStreamPresenter
from knowledge_chatbox_api.services.chat.retry_service import RetryService
from knowledge_chatbox_api.services.chat.workflow import ChatWorkflow, build_chat_workflow_deps
from knowledge_chatbox_api.services.documents.query_service import DocumentQueryService
from knowledge_chatbox_api.services.settings.runtime_settings import build_runtime_settings
from knowledge_chatbox_api.services.settings.settings_service import SettingsService
from knowledge_chatbox_api.utils.chroma import get_chroma_store

logger = get_logger(__name__)


class ChatRouteError(AppError):
    """Structured non-HTTP error used by chat route handlers."""

    default_message = "Chat operation failed."

    def __init__(
        self,
        status_code: int,
        code: str,
        message: str,
        *,
        details: Any | None = None,
    ) -> None:
        super().__init__(message, details=details, status_code=status_code, code=code)


class ChatApplicationService:
    """Own chat route orchestration so HTTP handlers stay thin."""

    def __init__(
        self,
        session: Session,
        settings: Settings | None = None,
    ) -> None:
        self.session = session
        self.settings = settings
        self.chat_repository = ChatRepository(session)
        self.chat_run_repository = ChatRunRepository(session)
        self.chat_run_event_repository = ChatRunEventRepository(session)
        self.document_repository = DocumentRepository(session)
        self.document_query_service = DocumentQueryService(session)
        self._settings_service: SettingsService | None = None

    @property
    def settings_service(self) -> SettingsService:
        if self._settings_service is None:
            if self.settings is None:
                from knowledge_chatbox_api.core.errors import AppError

                raise AppError(
                    "Settings must be provided for this operation.",
                    status_code=500,
                    code="internal_error",
                )
            self._settings_service = SettingsService(self.session, self.settings)
        return self._settings_service

    def create_session(
        self,
        actor: User,
        title: str | None,
        *,
        reasoning_mode: str = ReasoningMode.DEFAULT,
    ) -> ChatSession:
        """Create one session for the current user."""
        chat_session = self.chat_repository.create_session(
            actor.id,
            title,
            reasoning_mode=reasoning_mode,
        )
        self.session.commit()
        self.session.refresh(chat_session)
        return chat_session

    def delete_session(self, actor: User, session_id: int) -> None:
        """Delete one owned chat session and any associated runs."""
        self._require_owned_session(actor, session_id)
        self.chat_run_repository.delete_runs_for_session(session_id)
        self.chat_repository.delete_session(session_id)
        self.session.commit()

    def list_sessions(self, actor: User) -> list[ChatSession]:
        """Return all sessions that belong to the current user."""
        return self.chat_repository.list_sessions(actor.id)

    def update_session(self, actor: User, session_id: int, patch: dict[str, Any]) -> ChatSession:
        """Update one owned chat session."""
        chat_session = self._require_owned_session(actor, session_id)
        self.chat_repository.update_session(
            session_id,
            title=patch.get("title", _UNSET),
            reasoning_mode=patch.get("reasoning_mode", _UNSET),
        )
        self.session.commit()
        self.session.refresh(chat_session)
        return chat_session

    def list_messages(self, actor: User, session_id: int) -> list[ChatMessage]:
        """Return all messages for one owned session."""
        self._require_owned_session(actor, session_id)
        return self.chat_repository.list_messages(session_id)

    def list_messages_window(
        self,
        actor: User,
        session_id: int,
        *,
        before_id: int | None,
        limit: int,
    ) -> list[ChatMessage]:
        """Return one tail window of messages for one owned session."""
        self._require_owned_session(actor, session_id)
        return self.chat_repository.list_messages_window(
            session_id,
            before_id=before_id,
            limit=limit,
        )

    def get_session_context(self, actor: User, session_id: int) -> dict[str, Any]:
        """Return the compact right-panel context for one owned session."""
        self._require_owned_session(actor, session_id)
        attachments = self.chat_repository.list_session_attachments(session_id)
        deduplicated_attachments: dict[str, Any] = {}
        for attachment in attachments:
            if attachment.document_id is not None:
                key = f"document:{attachment.document_id}"
            elif attachment.document_revision_id is not None:
                key = f"version:{attachment.document_revision_id}"
            else:
                key = f"attachment:{attachment.attachment_id}"
            deduplicated_attachments[key] = attachment

        latest_assistant_message = self.chat_repository.get_latest_assistant_message(session_id)
        latest_assistant_sources = (
            latest_assistant_message.sources_json
            if latest_assistant_message is not None
            and latest_assistant_message.sources_json is not None
            else []
        )

        return {
            "session_id": session_id,
            "attachment_count": len(deduplicated_attachments),
            "attachments": list(deduplicated_attachments.values()),
            "latest_assistant_message_id": (
                latest_assistant_message.id if latest_assistant_message is not None else None
            ),
            "latest_assistant_sources": latest_assistant_sources,
        }

    def delete_failed_message(self, actor: User, message_id: int) -> None:
        """Delete one failed user message and any assistant replies tied to it."""
        message = self._require_owned_message(actor, message_id)
        if message.role != ChatMessageRole.USER or message.status != ChatMessageStatus.FAILED:
            raise ChatRouteError(
                409,
                "chat_message_delete_not_allowed",
                "Only failed user messages can be deleted.",
            )

        assistant_replies = self.chat_repository.list_assistant_replies(message.id)
        for assistant_reply in assistant_replies:
            self.chat_run_repository.delete_runs_for_messages(message.id, assistant_reply.id)
            self.chat_repository.delete_message(assistant_reply.id)
        self.chat_repository.delete_message(message.id)
        self.session.commit()

    def archive_message_attachment(
        self,
        actor: User,
        message_id: int,
        attachment_id: str,
        document_revision_id: int,
    ) -> ChatMessage:
        """Link one chat attachment to a persisted document record."""
        message = self._require_owned_message(actor, message_id)
        document_version = self.document_query_service.get_document_revision(
            actor,
            document_revision_id,
        )
        if document_version is None:
            raise ChatRouteError(404, "document_not_found", "Document not found.")
        document = self.document_repository.get_document_entity(document_version.document_id)
        if document is None:
            raise ChatRouteError(404, "document_not_found", "Document not found.")

        attachments = self.chat_repository.list_attachments(message.id)
        for attachment in attachments:
            if attachment.attachment_id != attachment_id:
                continue
            attachment.document_revision_id = document_version.id
            attachment.document_id = document.id
            attachment.archived_at = datetime.now(UTC)
            self.session.commit()
            self.session.refresh(message)
            return message

        raise ChatRouteError(404, "chat_attachment_not_found", "Chat attachment not found.")

    def create_message(
        self,
        actor: User,
        session_id: int,
        payload: CreateChatMessageRequest,
    ) -> tuple[ChatMessage, ChatMessage]:
        """Execute the sync chat flow for one owned session."""
        chat_session = self._require_owned_session(actor, session_id)
        retry_service = RetryService(self.chat_repository, self.session)
        if payload.retry_of_message_id is not None:
            user_message = retry_service.retry_user_message(
                session_id=session_id,
                content=payload.content,
                client_request_id=payload.client_request_id,
                retry_of_message_id=payload.retry_of_message_id,
            )
        else:
            user_message = retry_service.create_or_reuse_user_message(
                attachments=dump_chat_attachments(payload.attachments),
                session_id=session_id,
                content=payload.content,
                client_request_id=payload.client_request_id,
            )

        existing_assistant = self.chat_repository.get_assistant_reply(user_message.id)
        if payload.retry_of_message_id is None and existing_assistant is not None:
            return user_message, existing_assistant

        settings_record = self.settings_service.get_or_create_settings_record()
        runtime_settings = build_runtime_settings(
            settings_record,
            reasoning_mode=chat_session.reasoning_mode,
        )
        attachments_payload = (
            [attachment.model_dump() for attachment in payload.attachments]
            if payload.attachments
            else None
        )
        assistant_message = existing_assistant or retry_service.create_assistant_reply(
            session_id=session_id,
            reply_to_message_id=user_message.id,
            content="",
        )

        try:
            result = ChatWorkflow().run_sync(
                deps=build_chat_workflow_deps(
                    session_id=session_id,
                    session=self.session,
                    actor=actor,
                    chat_repository=self.chat_repository,
                    chat_run_repository=self.chat_run_repository,
                    chat_run_event_repository=self.chat_run_event_repository,
                    chroma_store=get_chroma_store(),
                    embedding_adapter=build_embedding_adapter_from_settings(settings_record),
                    runtime_settings=runtime_settings,
                    request_metadata={"path": "sync", "session_id": session_id},
                ),
                session_id=session_id,
                question=user_message.content,
                attachments=attachments_payload,
            )
            answer = result.answer
            sources = [source.model_dump() for source in result.sources]
            user_message.status = ChatMessageStatus.SUCCEEDED
            user_message.error_message = None
            assistant_message.content = answer
            assistant_message.status = ChatMessageStatus.SUCCEEDED
            assistant_message.error_message = None
            assistant_message.sources_json = sources
        except Exception as exc:  # noqa: BLE001
            user_message.status = ChatMessageStatus.FAILED
            user_message.error_message = "Chat processing failed."
            assistant_message.content = ""
            assistant_message.status = ChatMessageStatus.FAILED
            assistant_message.error_message = "Chat processing failed."
            assistant_message.sources_json = []
            logger.warning(
                "chat_sync_message_failed",
                session_id=session_id,
                response_provider=runtime_settings.response_route.provider,
                response_model=runtime_settings.response_route.model,
                failure_type="chat_answer_error",
                error_message=str(exc),
            )

        self.session.commit()
        self.session.refresh(user_message)
        self.session.refresh(assistant_message)
        return user_message, assistant_message

    def create_stream_components(
        self,
        actor: User,
        session_id: int,
    ) -> tuple[ChatStreamPresenter, ChatRunService]:
        """Return the presenter and stream runner for one owned session."""
        chat_session = self._require_owned_session(actor, session_id)
        settings_record = self.settings_service.get_or_create_settings_record()
        runtime_settings = build_runtime_settings(
            settings_record,
            reasoning_mode=chat_session.reasoning_mode,
        )
        presenter = ChatStreamPresenter()
        chat_run_service = ChatRunService(
            session=self.session,
            chat_repository=self.chat_repository,
            chat_run_repository=self.chat_run_repository,
            chat_run_event_repository=self.chat_run_event_repository,
            retry_service=RetryService(self.chat_repository, self.session),
            chroma_store=get_chroma_store(),
            embedding_adapter=build_embedding_adapter_from_settings(settings_record),
            settings=runtime_settings,
            presenter=presenter,
        )
        return presenter, chat_run_service

    def list_active_runs(self, actor: User) -> list[Any]:
        """Return active runs that belong to the current user."""
        return self.chat_run_repository.list_active_runs(actor.id)

    def get_run(self, actor: User, run_id: int) -> Any:
        """Return one owned run or raise a not-found error."""
        run = self.chat_run_repository.get_run(run_id)
        if run is None:
            raise ChatRouteError(404, "chat_run_not_found", "Chat run not found.")
        self._require_owned_session(actor, run.session_id, error_code="chat_run_not_found")
        return run

    def _require_owned_session(
        self,
        actor: User,
        session_id: int,
        *,
        error_code: str = "chat_session_not_found",
    ) -> Any:
        chat_session = self.chat_repository.get_session(session_id)
        if chat_session is None or chat_session.user_id != actor.id:
            raise ChatRouteError(404, error_code, "Chat session not found.")
        return chat_session

    def _require_owned_message(self, actor: User, message_id: int) -> Any:
        message = self.chat_repository.get_message(message_id)
        if message is None:
            raise ChatRouteError(404, "chat_message_not_found", "Chat message not found.")
        self._require_owned_session(actor, message.session_id, error_code="chat_message_not_found")
        return message
