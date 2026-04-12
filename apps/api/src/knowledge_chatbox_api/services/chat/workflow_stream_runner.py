"""Workflow-backed chat stream execution."""

import asyncio
from contextlib import suppress
from dataclasses import asdict
from typing import TYPE_CHECKING, Any, cast

from pydantic_ai import AgentRunResultEvent

from knowledge_chatbox_api.core.logging import get_logger
from knowledge_chatbox_api.core.observation import OPERATION_KIND_CHAT_STREAM
from knowledge_chatbox_api.models.enums import ChatMessageStatus, ChatRunStatus
from knowledge_chatbox_api.services.chat.chat_persistence_service import ChatPersistenceService
from knowledge_chatbox_api.services.chat.stream_events import (
    StreamEvent,
    StreamEventBatchItem,
    StreamEventEnvelope,
    StreamEventName,
    StreamEventPayload,
    append_event_batch,
)
from knowledge_chatbox_api.services.chat.workflow.event_bridge import ChatWorkflowEventBridge
from knowledge_chatbox_api.services.chat.workflow.output import merge_sources_by_key

if TYPE_CHECKING:
    from collections.abc import AsyncIterator, Coroutine

STREAM_INTERRUPTED_ERROR_MESSAGE = "本次生成连接中断，请重试。"
STREAM_CANCELLED_ERROR_MESSAGE = "已停止生成。你可以继续提问，或重新发送。"
PROVIDER_STREAM_ENDED_EARLY_ERROR_MESSAGE = "provider stream ended before completion"
CANCEL_POLL_INTERVAL_SECONDS = 0.05
logger = get_logger(__name__)


class WorkflowStreamCancelledError(Exception):
    """Raised when the current stream run has been cancelled explicitly."""


class WorkflowStreamRunner:
    def __init__(
        self,
        *,
        session,
        chat_run_event_repository,
        presenter,
        workflow,
        workflow_deps,
        settings,
        run,
        assistant_message,
        user_message,
    ) -> None:
        self.session = session
        self.chat_run_event_repository = chat_run_event_repository
        self.presenter = presenter
        self.workflow = workflow
        self.workflow_deps = workflow_deps
        self.settings = settings
        self.run = run
        self.assistant_message = assistant_message
        self.user_message = user_message
        self.persistence = ChatPersistenceService(session)
        self.bridge = ChatWorkflowEventBridge()

    def stream(
        self,
        *,
        session_id: int,
        question: str,
        attachments: list[dict[str, Any]] | None,
        current_seq: int,
    ):
        async_events = cast(
            "AsyncIterator[object]",
            self.workflow.run_stream_events(
                deps=self.workflow_deps,
                session_id=session_id,
                question=question,
                attachments=attachments,
            ),
        )
        event_seq = current_seq
        started_text = False
        sources: list[dict[str, Any]] = []
        with asyncio.Runner() as runner:
            try:
                while True:
                    try:
                        workflow_event = runner.run(self._next_workflow_event(async_events))
                    except StopAsyncIteration:
                        break
                    except WorkflowStreamCancelledError:
                        event_seq, event = self._record_cancelled_run(
                            current_seq=event_seq,
                            session_id=session_id,
                            sources=sources,
                        )
                        yield event
                        return

                    if isinstance(workflow_event, AgentRunResultEvent):
                        output, usage = self.bridge.extract_result(workflow_event)
                        if not started_text and output.answer:
                            self.assistant_message.content = output.answer
                        event_seq, completion_events = self._complete_run(
                            current_seq=event_seq,
                            session_id=session_id,
                            sources=sources,
                            started_text=started_text,
                            usage=asdict(usage),
                        )
                        for event in completion_events:
                            yield event
                        return

                    extracted_sources = self.bridge.extract_sources(
                        getattr(getattr(workflow_event, "result", None), "content", None)
                    )
                    if extracted_sources:
                        sources = merge_sources_by_key(sources, extracted_sources)

                    for event_name, payload in self.bridge.map_event(
                        workflow_event,
                        run_id=self.run.id,
                        assistant_message_id=self.assistant_message.id,
                    ):
                        if event_name == StreamEvent.PART_TEXT_START:
                            self.persistence.mark_run_running(self.run, self.assistant_message)
                            started_text = True
                            event_seq, event = self._append_event(event_seq, event_name, payload)
                        elif event_name == StreamEvent.PART_TEXT_DELTA:
                            delta = payload.get("delta", "") or ""
                            self.persistence.append_text_delta(self.assistant_message, delta)
                            event_seq, event = self._append_event(
                                event_seq,
                                event_name,
                                payload,
                                commit=False,
                            )
                        else:
                            event_seq, event = self._append_event(event_seq, event_name, payload)
                        yield event

                event_seq, event = self._record_failed_run(
                    current_seq=event_seq,
                    error_message=PROVIDER_STREAM_ENDED_EARLY_ERROR_MESSAGE,
                    failure_type="workflow_stream_ended_early",
                    session_id=session_id,
                    sources=sources,
                )
                yield event
            except (GeneratorExit, asyncio.CancelledError):
                self._record_failed_run(
                    current_seq=event_seq,
                    error_message=STREAM_INTERRUPTED_ERROR_MESSAGE,
                    failure_type="stream_interrupted",
                    session_id=session_id,
                    sources=sources,
                )
                raise
            except Exception:
                logger.exception(
                    "chat_stream_run_exception",
                    run_id=self.run.id,
                    session_id=session_id,
                    response_provider=self.settings.response_route.provider,
                    response_model=self.settings.response_route.model,
                    operation_kind=OPERATION_KIND_CHAT_STREAM,
                )
                event_seq, event = self._record_failed_run(
                    current_seq=event_seq,
                    error_message="Chat processing failed.",
                    failure_type="workflow_error",
                    session_id=session_id,
                    sources=sources,
                )
                yield event
            finally:
                aclose = getattr(async_events, "aclose", None)
                if callable(aclose):
                    runner.run(cast("Coroutine[Any, Any, object]", aclose()))

    async def _next_workflow_event(self, async_events: "AsyncIterator[object]") -> object:
        next_event_task = asyncio.create_task(
            cast("Coroutine[Any, Any, object]", async_events.__anext__())
        )

        try:
            while True:
                done, _ = await asyncio.wait(
                    {next_event_task},
                    timeout=CANCEL_POLL_INTERVAL_SECONDS,
                )
                if done:
                    return await next_event_task
                if self._is_run_cancelled():
                    next_event_task.cancel()
                    with suppress(asyncio.CancelledError, StopAsyncIteration):
                        await next_event_task
                    raise WorkflowStreamCancelledError
        finally:
            if not next_event_task.done():
                next_event_task.cancel()
                with suppress(asyncio.CancelledError):
                    await next_event_task

    def _is_run_cancelled(self) -> bool:
        self.session.refresh(self.run, attribute_names=["status", "error_message", "finished_at"])
        return self.run.status == ChatRunStatus.CANCELLED

    def _complete_run(
        self,
        *,
        current_seq: int,
        session_id: int,
        sources: list[dict[str, Any]],
        started_text: bool,
        usage: dict[str, Any] | None,
    ) -> tuple[int, list[StreamEventEnvelope]]:
        completion_events: list[StreamEventBatchItem] = []
        if started_text:
            completion_events.append(
                (
                    StreamEvent.PART_TEXT_END,
                    {
                        "run_id": self.run.id,
                        "assistant_message_id": self.assistant_message.id,
                    },
                )
            )
        completion_events.append(
            (
                StreamEvent.USAGE_FINAL,
                {
                    "run_id": self.run.id,
                    "usage": usage or {},
                },
            )
        )
        next_seq, presented_completion_events = self._append_event_batch(
            current_seq,
            completion_events,
        )
        self.persistence.complete_run(self.run, self.assistant_message, sources, usage)
        logger.info(
            "chat_stream_run_completed",
            run_id=self.run.id,
            session_id=session_id,
            assistant_message_id=self.assistant_message.id,
            source_count=len(sources),
            response_provider=self.settings.response_route.provider,
            response_model=self.settings.response_route.model,
            operation_kind=OPERATION_KIND_CHAT_STREAM,
        )
        next_seq, terminal_events = self._append_event_batch(
            next_seq,
            [
                (
                    StreamEvent.MESSAGE_COMPLETED,
                    {
                        "run_id": self.run.id,
                        "assistant_message_id": self.assistant_message.id,
                        "status": ChatMessageStatus.SUCCEEDED,
                    },
                ),
                (
                    StreamEvent.RUN_COMPLETED,
                    {
                        "run_id": self.run.id,
                        "assistant_message_id": self.assistant_message.id,
                    },
                ),
            ],
        )
        return next_seq, [*presented_completion_events, *terminal_events]

    def _record_failed_run(
        self,
        *,
        current_seq: int,
        error_message: str,
        failure_type: str,
        session_id: int,
        sources: list[dict[str, Any]] | None = None,
    ) -> tuple[int, StreamEventEnvelope]:
        self.user_message.status = ChatMessageStatus.FAILED
        self.user_message.error_message = error_message
        self.persistence.fail_run(
            self.run,
            self.assistant_message,
            error_message,
            sources=sources,
        )
        logger.warning(
            "chat_stream_run_failed",
            run_id=self.run.id,
            session_id=session_id,
            response_provider=self.settings.response_route.provider,
            response_model=self.settings.response_route.model,
            failure_type=failure_type,
            error_message=error_message,
            operation_kind=OPERATION_KIND_CHAT_STREAM,
        )
        return self._append_event(
            current_seq,
            StreamEvent.RUN_FAILED,
            {
                "run_id": self.run.id,
                "assistant_message_id": self.assistant_message.id,
                "error_message": error_message,
            },
        )

    def _record_cancelled_run(
        self,
        *,
        current_seq: int,
        session_id: int,
        sources: list[dict[str, Any]] | None = None,
    ) -> tuple[int, StreamEventEnvelope]:
        self.persistence.cancel_run(
            self.run,
            self.assistant_message,
            STREAM_CANCELLED_ERROR_MESSAGE,
            sources=sources,
        )
        logger.info(
            "chat_stream_run_cancelled",
            run_id=self.run.id,
            session_id=session_id,
            response_provider=self.settings.response_route.provider,
            response_model=self.settings.response_route.model,
            operation_kind=OPERATION_KIND_CHAT_STREAM,
        )
        return self._append_event(
            current_seq,
            StreamEvent.RUN_FAILED,
            {
                "run_id": self.run.id,
                "assistant_message_id": self.assistant_message.id,
                "error_message": STREAM_CANCELLED_ERROR_MESSAGE,
            },
        )

    def _append_event(
        self,
        current_seq: int,
        event_name: StreamEventName,
        data: StreamEventPayload,
        *,
        commit: bool = True,
    ) -> tuple[int, StreamEventEnvelope]:
        next_seq = current_seq + 1
        self.chat_run_event_repository.append_event(
            run_id=self.run.id,
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
        current_seq: int,
        events: list[StreamEventBatchItem],
    ) -> tuple[int, list[StreamEventEnvelope]]:
        result: tuple[int, list[StreamEventEnvelope]] = append_event_batch(
            run_id=self.run.id,
            current_seq=current_seq,
            events=events,
            event_repository=self.chat_run_event_repository,
            presenter=self.presenter,
            session=self.session,
        )
        return result
