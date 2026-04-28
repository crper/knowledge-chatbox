"""聊天运行时服务。"""

import asyncio
from typing import TYPE_CHECKING

from sqlalchemy.orm import Session

from knowledge_chatbox_api.core.logging import get_logger
from knowledge_chatbox_api.core.observation import OPERATION_KIND_CHAT_STREAM
from knowledge_chatbox_api.models.enums import ChatMessageRole, ChatMessageStatus, ChatRunStatus
from knowledge_chatbox_api.providers.base import EmbeddingAdapterProtocol
from knowledge_chatbox_api.repositories.chat_repository import ChatRepository
from knowledge_chatbox_api.repositories.chat_run_event_repository import ChatRunEventRepository
from knowledge_chatbox_api.repositories.chat_run_repository import ChatRunRepository
from knowledge_chatbox_api.schemas.chat import ChatAttachmentMetadata, dump_chat_attachments
from knowledge_chatbox_api.schemas.settings import ProviderRuntimeSettings
from knowledge_chatbox_api.services.chat.chat_stream_presenter import ChatStreamPresenter
from knowledge_chatbox_api.services.chat.pending_stream_cancel_registry import (
    pending_stream_cancel_registry,
)
from knowledge_chatbox_api.services.chat.retry_service import RetryService
from knowledge_chatbox_api.services.chat.stream_events import (
    StreamEvent,
    StreamEventBatchItem,
    StreamEventPayload,
    append_event_batch,
)
from knowledge_chatbox_api.services.chat.workflow import ChatWorkflow, build_chat_workflow_deps
from knowledge_chatbox_api.services.chat.workflow_stream_runner import (
    STREAM_CANCELLED_ERROR_MESSAGE,
    STREAM_INTERRUPTED_ERROR_MESSAGE,
    WorkflowStreamRunner,
)
from knowledge_chatbox_api.services.settings.runtime_settings import parse_runtime_settings
from knowledge_chatbox_api.utils.chroma import ChunkStore

if TYPE_CHECKING:
    from knowledge_chatbox_api.models.chat import ChatMessage, ChatRun

logger = get_logger(__name__)


class ChatRunService:
    """封装聊天运行记录、事件和消息投影。"""

    def __init__(
        self,
        *,
        session: Session,
        chat_repository: ChatRepository,
        chat_run_repository: ChatRunRepository,
        chat_run_event_repository: ChatRunEventRepository,
        retry_service: RetryService,
        chroma_store: ChunkStore,
        embedding_adapter: EmbeddingAdapterProtocol,
        settings: ProviderRuntimeSettings,
        workflow_factory: type[ChatWorkflow] | None = None,
        presenter: ChatStreamPresenter,
    ) -> None:
        self.session = session
        self.chat_repository = chat_repository
        self.chat_run_repository = chat_run_repository
        self.chat_run_event_repository = chat_run_event_repository
        self.retry_service = retry_service
        self.chroma_store = chroma_store
        self.embedding_adapter = embedding_adapter
        self.workflow_factory = workflow_factory or ChatWorkflow
        self.settings = parse_runtime_settings(settings)
        self.presenter = presenter

    def stream_run(
        self,
        *,
        session_id: int,
        content: str,
        attachments: list[ChatAttachmentMetadata] | None = None,
        client_request_id: str,
        retry_of_message_id: int | None = None,
    ):
        if self._consume_pending_cancel(session_id, client_request_id):
            self.session.rollback()
            return

        if retry_of_message_id is not None:
            user_message = self.retry_service.retry_user_message(
                session_id=session_id,
                client_request_id=client_request_id,
                retry_of_message_id=retry_of_message_id,
            )
        else:
            user_message = self.retry_service.create_or_reuse_user_message(
                attachments=dump_chat_attachments(attachments),
                session_id=session_id,
                content=content,
                client_request_id=client_request_id,
            )
        if self._consume_pending_cancel(session_id, client_request_id):
            self.session.rollback()
            return

        existing_run = self.chat_run_repository.get_run_by_client_request_id(
            session_id=session_id,
            client_request_id=client_request_id,
        )
        if existing_run is not None:
            yield from self._replay_existing_run(existing_run)
            return

        response_provider = self.settings.response_route.provider
        response_model = self.settings.response_route.model
        run = self.chat_run_repository.create_run(
            session_id=session_id,
            status=ChatRunStatus.PENDING,
            response_provider=response_provider,
            response_model=response_model,
            reasoning_mode=self.settings.reasoning_mode,
            client_request_id=client_request_id,
        )
        assistant_message = self.retry_service.create_assistant_reply(
            session_id=session_id,
            reply_to_message_id=user_message.id,
            content="",
        )
        run.user_message_id = user_message.id
        run.assistant_message_id = assistant_message.id
        if self._consume_pending_cancel(session_id, client_request_id):
            self.session.rollback()
            return

        self.session.commit()
        self.session.refresh(user_message)
        self.session.refresh(assistant_message)
        self.session.refresh(run)
        if self._consume_pending_cancel(session_id, client_request_id):
            self._discard_unstarted_run(
                run=run,
                assistant_message=assistant_message,
                user_message=user_message,
            )
            return

        event_seq = 0
        logger.info(
            "chat_stream_run_started",
            run_id=run.id,
            session_id=session_id,
            attachment_count=len(attachments or []),
            response_provider=response_provider,
            response_model=response_model,
            operation_kind=OPERATION_KIND_CHAT_STREAM,
        )

        try:
            event_seq, initial_events = self._append_event_batch(
                run,
                event_seq,
                self._initial_events(
                    run_id=run.id,
                    session_id=session_id,
                    user_message_id=user_message.id,
                    assistant_message_id=assistant_message.id,
                ),
            )
            yield from initial_events

            workflow_runner = WorkflowStreamRunner(
                session=self.session,
                chat_run_event_repository=self.chat_run_event_repository,
                presenter=self.presenter,
                workflow=self.workflow_factory(),
                workflow_deps=build_chat_workflow_deps(
                    session_id=session_id,
                    session=self.session,
                    chat_repository=self.chat_repository,
                    chroma_store=self.chroma_store,
                    embedding_adapter=self.embedding_adapter,
                    runtime_settings=self.settings,
                    request_metadata={"path": "stream", "session_id": session_id},
                ),
                settings=self.settings,
                run=run,
                assistant_message=assistant_message,
                user_message=user_message,
            )
            yield from workflow_runner.stream(
                session_id=session_id,
                question=user_message.content,
                attachments=attachments,
                current_seq=event_seq,
            )
            return
        except (GeneratorExit, asyncio.CancelledError):
            self._mark_interrupted_run(
                run=run,
                assistant_message=assistant_message,
                current_seq=event_seq,
            )
            raise

    def _consume_pending_cancel(self, session_id: int, client_request_id: str) -> bool:
        return pending_stream_cancel_registry.consume_cancel(session_id, client_request_id)

    def _discard_unstarted_run(
        self,
        *,
        run,
        assistant_message,
        user_message,
    ) -> None:
        self.session.delete(run)
        self.session.delete(assistant_message)
        self.session.delete(user_message)
        self.session.commit()

    def _initial_events(
        self,
        *,
        run_id: int,
        session_id: int,
        user_message_id: int,
        assistant_message_id: int,
    ) -> list[StreamEventBatchItem]:
        return [
            StreamEventBatchItem(
                event_name=StreamEvent.RUN_STARTED,
                payload=StreamEventPayload(
                    run_id=run_id,
                    session_id=session_id,
                    user_message_id=user_message_id,
                    assistant_message_id=assistant_message_id,
                ),
            ),
            StreamEventBatchItem(
                event_name=StreamEvent.MESSAGE_STARTED,
                payload=StreamEventPayload(
                    run_id=run_id,
                    assistant_message_id=assistant_message_id,
                    role=ChatMessageRole.ASSISTANT,
                ),
            ),
        ]

    def _append_event_batch(
        self,
        run,
        current_seq: int,
        events: list[StreamEventBatchItem],
    ):
        return append_event_batch(
            run_id=run.id,
            current_seq=current_seq,
            events=events,
            event_repository=self.chat_run_event_repository,
            presenter=self.presenter,
            session=self.session,
        )

    def _replay_existing_run(self, run: "ChatRun"):
        for event in self.chat_run_event_repository.list_for_run(run.id):
            yield self.presenter.event(
                StreamEvent(event.event_type),
                event.payload_json,
            )

    def _mark_interrupted_run(
        self,
        *,
        run: "ChatRun",
        assistant_message: "ChatMessage",
        current_seq: int,
    ) -> None:
        if run.status not in {ChatRunStatus.PENDING, ChatRunStatus.RUNNING}:
            return
        run.status = ChatRunStatus.FAILED
        run.error_message = STREAM_INTERRUPTED_ERROR_MESSAGE
        assistant_message.status = ChatMessageStatus.FAILED
        assistant_message.error_message = STREAM_INTERRUPTED_ERROR_MESSAGE
        self.chat_run_event_repository.append_event(
            run_id=run.id,
            seq=current_seq + 1,
            event_type=StreamEvent.RUN_FAILED,
            payload_json={
                "run_id": run.id,
                "assistant_message_id": assistant_message.id,
                "error_message": STREAM_INTERRUPTED_ERROR_MESSAGE,
            },
            flush=False,
        )
        self.session.commit()

    def request_cancel(self, run: "ChatRun") -> bool:
        if run.status == ChatRunStatus.CANCELLED:
            return True
        if run.status not in {ChatRunStatus.PENDING, ChatRunStatus.RUNNING}:
            return False
        run.status = ChatRunStatus.CANCELLED
        run.error_message = STREAM_CANCELLED_ERROR_MESSAGE
        self.session.commit()
        return True
