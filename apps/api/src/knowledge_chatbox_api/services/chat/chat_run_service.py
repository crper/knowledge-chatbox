"""聊天运行时服务。"""

from __future__ import annotations

import asyncio
from typing import Any

from knowledge_chatbox_api.core.logging import get_logger
from knowledge_chatbox_api.services.chat.attachment_metadata import build_attachment_metadata
from knowledge_chatbox_api.services.chat.chat_persistence_service import ChatPersistenceService
from knowledge_chatbox_api.services.chat.chat_service import ChatService

STREAM_INTERRUPTED_ERROR_MESSAGE = "本次生成连接中断，请重试。"
PROVIDER_STREAM_ENDED_EARLY_ERROR_MESSAGE = "provider stream ended before completion"
logger = get_logger(__name__)


def _event_attr(event: Any, name: str, default=None):
    if isinstance(event, dict):
        return event.get(name, default)
    return getattr(event, name, default)


def _settings_attr(value: Any, name: str, default=None):
    if isinstance(value, dict):
        return value.get(name, default)
    return getattr(value, name, default)


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
        response_adapter,
        embedding_adapter,
        settings,
        presenter,
    ) -> None:
        self.session = session
        self.chat_repository = chat_repository
        self.chat_run_repository = chat_run_repository
        self.chat_run_event_repository = chat_run_event_repository
        self.retry_service = retry_service
        self.chroma_store = chroma_store
        self.response_adapter = response_adapter
        self.embedding_adapter = embedding_adapter
        self.settings = settings
        self.presenter = presenter
        self.persistence = ChatPersistenceService(session)

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

        sources: list[dict[str, Any]] = []
        try:
            event_seq, initial_events = self._append_event_batch(
                run,
                event_seq,
                [
                    (
                        "run.started",
                        {
                            "run_id": run.id,
                            "session_id": session_id,
                            "user_message_id": user_message.id,
                            "assistant_message_id": assistant_message.id,
                        },
                    ),
                    (
                        "message.started",
                        {
                            "run_id": run.id,
                            "assistant_message_id": assistant_message.id,
                            "role": "assistant",
                        },
                    ),
                    (
                        "tool.call",
                        {
                            "run_id": run.id,
                            "tool_name": "knowledge_search",
                            "input": {"query": user_message.content},
                        },
                    ),
                ],
            )
            for event in initial_events:
                yield event

            chat_service = ChatService(
                session=self.session,
                chat_repository=self.chat_repository,
                chroma_store=self.chroma_store,
                response_adapter=self.response_adapter,
                embedding_adapter=self.embedding_adapter,
                settings=self.settings,
            )

            try:
                prompt_messages, sources = chat_service.build_prompt_messages_and_sources(
                    session_id,
                    user_message.content,
                    attachments=attachments,
                )
            except Exception as exc:  # noqa: BLE001
                event_seq, event = self._fail_stream_run(
                    run=run,
                    assistant_message=assistant_message,
                    user_message=user_message,
                    current_seq=event_seq,
                    session_id=session_id,
                    error_message=str(exc),
                    failure_type="prompt_assembly_error",
                )
                yield event
                return

            source_events: list[tuple[str, dict[str, Any]]] = [
                (
                    "tool.result",
                    {
                        "run_id": run.id,
                        "tool_name": "knowledge_search",
                        "sources_count": len(sources),
                    },
                )
            ]
            source_events.extend(
                (
                    "part.source",
                    {
                        "run_id": run.id,
                        "assistant_message_id": assistant_message.id,
                        "source": source,
                    },
                )
                for source in sources
            )
            event_seq, presented_source_events = self._append_event_batch(
                run,
                event_seq,
                source_events,
            )
            for event in presented_source_events:
                yield event

            started_text = False

            for chunk in self.response_adapter.stream_response(prompt_messages, self.settings):
                chunk_type = _event_attr(chunk, "type")
                if chunk_type == "text_delta":
                    if not started_text:
                        self.persistence.mark_run_running(run, assistant_message)
                        event_seq, event = self._append_event(
                            run,
                            event_seq,
                            "part.text.start",
                            {
                                "run_id": run.id,
                                "assistant_message_id": assistant_message.id,
                            },
                        )
                        yield event
                        started_text = True

                    delta = _event_attr(chunk, "delta", "") or ""
                    self.persistence.append_text_delta(assistant_message, delta)
                    event_seq, event = self._append_event(
                        run,
                        event_seq,
                        "part.text.delta",
                        {
                            "run_id": run.id,
                            "assistant_message_id": assistant_message.id,
                            "delta": delta,
                        },
                        commit=False,
                    )
                    yield event
                    continue

                if chunk_type == "completed":
                    event_seq, completion_events = self._complete_stream_run(
                        run=run,
                        assistant_message=assistant_message,
                        current_seq=event_seq,
                        session_id=session_id,
                        sources=sources,
                        started_text=started_text,
                        usage=_event_attr(chunk, "usage"),
                    )
                    for event in completion_events:
                        yield event
                    return

                if chunk_type == "error":
                    event_seq, event = self._fail_stream_run(
                        run=run,
                        assistant_message=assistant_message,
                        user_message=user_message,
                        current_seq=event_seq,
                        session_id=session_id,
                        error_message=_event_attr(chunk, "error_message")
                        or "provider stream failed",
                        failure_type="provider_error",
                        sources=sources,
                    )
                    yield event
                    return

            event_seq, event = self._fail_stream_run(
                run=run,
                assistant_message=assistant_message,
                user_message=user_message,
                current_seq=event_seq,
                session_id=session_id,
                error_message=PROVIDER_STREAM_ENDED_EARLY_ERROR_MESSAGE,
                failure_type="provider_stream_ended_early",
                sources=sources,
            )
            yield event
        except (GeneratorExit, asyncio.CancelledError):
            self._fail_interrupted_run(
                run,
                assistant_message,
                current_seq=event_seq,
                sources=sources,
            )
            raise

    def _complete_stream_run(
        self,
        *,
        run,
        assistant_message,
        current_seq: int,
        session_id: int,
        sources: list[dict[str, Any]],
        started_text: bool,
        usage: dict | None,
    ) -> tuple[int, list[dict]]:
        completion_events: list[tuple[str, dict[str, Any]]] = []
        if started_text:
            completion_events.append(
                (
                    "part.text.end",
                    {
                        "run_id": run.id,
                        "assistant_message_id": assistant_message.id,
                    },
                )
            )
        completion_events.append(
            (
                "usage.final",
                {
                    "run_id": run.id,
                    "usage": usage or {},
                },
            )
        )
        next_seq, presented_completion_events = self._append_event_batch(
            run,
            current_seq,
            completion_events,
        )
        self.persistence.complete_run(run, assistant_message, sources, usage)
        logger.info(
            "chat_stream_run_completed",
            run_id=run.id,
            session_id=session_id,
            assistant_message_id=assistant_message.id,
            source_count=len(sources),
            response_provider=self._response_provider_name(),
            response_model=self._response_model(),
        )
        next_seq, terminal_events = self._append_event_batch(
            run,
            next_seq,
            [
                (
                    "message.completed",
                    {
                        "run_id": run.id,
                        "assistant_message_id": assistant_message.id,
                        "status": "succeeded",
                    },
                ),
                (
                    "run.completed",
                    {
                        "run_id": run.id,
                        "assistant_message_id": assistant_message.id,
                    },
                ),
            ],
        )
        return next_seq, [*presented_completion_events, *terminal_events]

    def _fail_stream_run(
        self,
        *,
        run,
        assistant_message,
        user_message,
        current_seq: int,
        session_id: int,
        error_message: str,
        failure_type: str,
        sources: list[dict[str, Any]] | None = None,
    ) -> tuple[int, dict]:
        return self._record_failed_run(
            run=run,
            assistant_message=assistant_message,
            current_seq=current_seq,
            error_message=error_message,
            failure_type=failure_type,
            session_id=session_id,
            sources=sources,
            user_message=user_message,
        )

    def _record_failed_run(
        self,
        *,
        run,
        assistant_message,
        current_seq: int,
        error_message: str,
        failure_type: str,
        session_id: int,
        sources: list[dict[str, Any]] | None = None,
        user_message=None,
    ) -> tuple[int, dict]:
        if user_message is not None:
            user_message.status = "failed"
            user_message.error_message = error_message

        self.persistence.fail_run(
            run,
            assistant_message,
            error_message,
            sources=sources,
        )
        logger.warning(
            "chat_stream_run_failed",
            run_id=run.id,
            session_id=session_id,
            response_provider=self._response_provider_name(),
            response_model=self._response_model(),
            failure_type=failure_type,
            error_message=error_message,
        )
        return self._append_event(
            run,
            current_seq,
            "run.failed",
            {
                "run_id": run.id,
                "assistant_message_id": assistant_message.id,
                "error_message": error_message,
            },
        )

    def _append_event(
        self,
        run,
        current_seq: int,
        event_name: str,
        data: dict,
        *,
        commit: bool = True,
    ) -> tuple[int, dict]:
        next_seq = current_seq + 1
        self.chat_run_event_repository.append_event(
            run_id=run.id,
            seq=next_seq,
            event_type=event_name,
            payload_json=data,
            flush=commit,
        )
        if commit:
            self.session.commit()
        return next_seq, self.presenter.event(event_name, data)

    def _append_event_batch(
        self,
        run,
        current_seq: int,
        events: list[tuple[str, dict[str, Any]]],
    ) -> tuple[int, list[dict]]:
        if not events:
            return current_seq, []

        next_seq = current_seq
        presented_events: list[dict] = []
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
        route = getattr(self.settings, "response_route", None)
        provider = _settings_attr(route, "provider", "openai")
        return provider if isinstance(provider, str) else "openai"

    def _response_model(self) -> str:
        route = getattr(self.settings, "response_route", None)
        model = _settings_attr(route, "model", "unknown")
        return model if isinstance(model, str) else "unknown"

    def _reasoning_mode(self) -> str:
        mode = getattr(self.settings, "reasoning_mode", "default")
        return mode if isinstance(mode, str) else "default"

    def _fail_interrupted_run(
        self,
        run,
        assistant_message,
        *,
        current_seq: int,
        sources: list[dict[str, Any]] | None = None,
    ) -> None:
        if run.status not in {"pending", "running"}:
            return
        self._record_failed_run(
            run=run,
            assistant_message=assistant_message,
            current_seq=current_seq,
            error_message=STREAM_INTERRUPTED_ERROR_MESSAGE,
            failure_type="stream_interrupted",
            session_id=run.session_id,
            sources=sources,
        )
