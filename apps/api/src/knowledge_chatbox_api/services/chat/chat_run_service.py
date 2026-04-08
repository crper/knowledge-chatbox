"""聊天运行时服务。"""

from __future__ import annotations

import asyncio
from typing import Any

from knowledge_chatbox_api.core.logging import get_logger
from knowledge_chatbox_api.services.chat.attachment_metadata import build_attachment_metadata
from knowledge_chatbox_api.services.chat.stream_events import (
    MESSAGE_STARTED_EVENT,
    RUN_STARTED_EVENT,
    StreamEventBatchItem,
)
from knowledge_chatbox_api.services.chat.workflow import ChatWorkflow, build_chat_workflow_deps
from knowledge_chatbox_api.services.chat.workflow_stream_runner import (
    STREAM_INTERRUPTED_ERROR_MESSAGE,
    WorkflowStreamRunner,
)
from knowledge_chatbox_api.services.settings.runtime_settings import parse_runtime_settings

logger = get_logger(__name__)


class ChatRunService:
    """封装聊天运行记录、事件和消息投影。"""

    def __init__(
        self,
        *,
        session,
        chat_repository,
        chat_run_repository,
        chat_run_event_repository,
        retry_service,
        chroma_store,
        embedding_adapter,
        settings,
        workflow_factory=None,
        presenter,
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
        attachments: list[dict[str, Any]] | None = None,
        client_request_id: str,
        retry_of_message_id: int | None = None,
    ):
        if retry_of_message_id is not None:
            user_message = self.retry_service.retry_user_message(
                session_id=session_id,
                content=content,
                client_request_id=client_request_id,
                retry_of_message_id=retry_of_message_id,
            )
        else:
            user_message = self.retry_service.create_or_reuse_user_message(
                attachments=build_attachment_metadata(attachments),
                session_id=session_id,
                content=content,
                client_request_id=client_request_id,
            )
        existing_run = self.chat_run_repository.get_run_by_client_request_id(
            session_id=session_id,
            client_request_id=client_request_id,
        )
        if existing_run is not None:
            yield from self._replay_existing_run(existing_run)
            return

        run = self.chat_run_repository.create_run(
            session_id=session_id,
            status="pending",
            response_provider=self._response_provider_name(),
            response_model=self._response_model(),
            reasoning_mode=self._reasoning_mode(),
            client_request_id=client_request_id,
        )
        assistant_message = self.retry_service.create_assistant_reply(
            session_id=session_id,
            reply_to_message_id=user_message.id,
            content="",
        )
        run.user_message_id = user_message.id
        run.assistant_message_id = assistant_message.id
        self.session.commit()
        self.session.refresh(user_message)
        self.session.refresh(assistant_message)
        self.session.refresh(run)
        event_seq = 0
        logger.info(
            "chat_stream_run_started",
            run_id=run.id,
            session_id=session_id,
            attachment_count=len(attachments or []),
            response_provider=self._response_provider_name(),
            response_model=self._response_model(),
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
                    session=self.session,
                    actor=None,
                    chat_repository=self.chat_repository,
                    chat_run_repository=self.chat_run_repository,
                    chat_run_event_repository=self.chat_run_event_repository,
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

    def _initial_events(
        self,
        *,
        run_id: int,
        session_id: int,
        user_message_id: int,
        assistant_message_id: int,
    ) -> list[StreamEventBatchItem]:
        return [
            (
                RUN_STARTED_EVENT,
                {
                    "run_id": run_id,
                    "session_id": session_id,
                    "user_message_id": user_message_id,
                    "assistant_message_id": assistant_message_id,
                },
            ),
            (
                MESSAGE_STARTED_EVENT,
                {
                    "run_id": run_id,
                    "assistant_message_id": assistant_message_id,
                    "role": "assistant",
                },
            ),
        ]

    def _append_event_batch(
        self,
        run,
        current_seq: int,
        events: list[StreamEventBatchItem],
    ):
        if not events:
            return current_seq, []

        next_seq = current_seq
        presented_events = []
        for event_name, data in events:
            next_seq += 1
            self.chat_run_event_repository.append_event(
                run_id=run.id,
                seq=next_seq,
                event_type=event_name,
                payload_json=data,
                flush=False,
            )
            presented_events.append(self.presenter.event(event_name, data))

        self.session.commit()
        return next_seq, presented_events

    def _replay_existing_run(self, run):
        for event in self.chat_run_event_repository.list_for_run(run.id):
            yield self.presenter.event(event.event_type, event.payload_json)

    def _response_provider_name(self) -> str:
        return self.settings.response_route.provider

    def _response_model(self) -> str:
        return self.settings.response_route.model

    def _reasoning_mode(self) -> str:
        return self.settings.reasoning_mode

    def _mark_interrupted_run(
        self,
        *,
        run,
        assistant_message,
        current_seq: int,
    ) -> None:
        if run.status not in {"pending", "running"}:
            return
        run.status = "failed"
        run.error_message = STREAM_INTERRUPTED_ERROR_MESSAGE
        assistant_message.status = "failed"
        assistant_message.error_message = STREAM_INTERRUPTED_ERROR_MESSAGE
        self.chat_run_event_repository.append_event(
            run_id=run.id,
            seq=current_seq + 1,
            event_type="run.failed",
            payload_json={
                "run_id": run.id,
                "assistant_message_id": assistant_message.id,
                "error_message": STREAM_INTERRUPTED_ERROR_MESSAGE,
            },
            flush=False,
        )
        self.session.commit()
