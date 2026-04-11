from __future__ import annotations

from collections.abc import AsyncIterator
from types import SimpleNamespace

from pydantic_ai import AgentRunResultEvent
from pydantic_ai.messages import (
    FinalResultEvent,
    FunctionToolCallEvent,
    FunctionToolResultEvent,
    PartDeltaEvent,
    PartEndEvent,
    PartStartEvent,
    TextPart,
    TextPartDelta,
    ToolCallPart,
    ToolReturnPart,
)
from pydantic_ai.usage import RunUsage
from tests.fixtures.factories import (
    ChatRunFactory,
    ChatSessionFactory,
    SpaceFactory,
    UserFactory,
)
from tests.fixtures.stubs import InMemoryChromaStore

from knowledge_chatbox_api.api.routes.chat import stream_presented_events
from knowledge_chatbox_api.repositories.chat_repository import ChatRepository
from knowledge_chatbox_api.repositories.chat_run_event_repository import ChatRunEventRepository
from knowledge_chatbox_api.repositories.chat_run_repository import ChatRunRepository
from knowledge_chatbox_api.services.chat.chat_run_service import ChatRunService
from knowledge_chatbox_api.services.chat.chat_stream_presenter import ChatStreamPresenter
from knowledge_chatbox_api.services.chat.retry_service import RetryService
from knowledge_chatbox_api.services.settings.runtime_settings import parse_runtime_settings


def create_user_and_session(migrated_db_session):
    user = UserFactory.persisted_create(migrated_db_session, username="alice")
    workspace = SpaceFactory.persisted_create(
        migrated_db_session,
        owner_user_id=user.id,
        slug=f"workspace-{user.id}",
        name="workspace",
    )

    chat_session = ChatSessionFactory.persisted_create(
        migrated_db_session,
        space_id=workspace.id,
        user_id=user.id,
        title="session",
    )
    return chat_session


def build_chat_run_service(
    migrated_db_session,
    *,
    response_adapter,
    event_repository: ChatRunEventRepository | None = None,
    retrieved_sources: list[dict] | None = None,
    workflow_factory=None,
):
    chat_repository = ChatRepository(migrated_db_session)
    run_repository = ChatRunRepository(migrated_db_session)
    active_event_repository = event_repository or ChatRunEventRepository(migrated_db_session)
    active_workflow_factory = workflow_factory or build_workflow_factory(
        response_adapter,
        retrieved_sources=retrieved_sources,
    )
    service = ChatRunService(
        session=migrated_db_session,
        chat_repository=chat_repository,
        chat_run_repository=run_repository,
        chat_run_event_repository=active_event_repository,
        retry_service=RetryService(chat_repository, migrated_db_session),
        chroma_store=InMemoryChromaStore(),
        embedding_adapter=None,
        settings=SimpleNamespace(
            response_route={"provider": "openai", "model": "gpt-5.4"},
            embedding_route={"provider": "openai", "model": "text-embedding-3-small"},
            system_prompt=None,
            active_index_generation=1,
        ),
        workflow_factory=active_workflow_factory,
        presenter=ChatStreamPresenter(),
    )
    return service, chat_repository, run_repository, active_event_repository


def build_workflow_factory(response_adapter, *, retrieved_sources: list[dict] | None = None):
    class WorkflowResultStub:
        def __init__(self, output: str, usage: dict | None = None) -> None:
            self.output = output
            self._usage = usage or {}

        def usage(self):
            return RunUsage(**self._usage)

    class AdapterBackedChatWorkflow:
        def run_stream_events(
            self,
            *,
            deps,
            session_id: int,
            question: str,
            attachments=None,
        ) -> AsyncIterator[object]:
            assert session_id > 0
            assert deps.request_metadata["path"] == "stream"

            async def _events():
                yield FunctionToolCallEvent(
                    part=ToolCallPart("knowledge_search", {"query": question}, "call-1")
                )
                yield FunctionToolResultEvent(
                    result=ToolReturnPart(
                        "knowledge_search",
                        {
                            "context_sections": ["Document: source"] if retrieved_sources else [],
                            "sources": retrieved_sources or [],
                        },
                        "call-1",
                    )
                )
                chunks = list(
                    response_adapter.stream_response(
                        [{"role": "user", "content": question}],
                        deps.runtime_settings,
                    )
                )
                text_parts: list[str] = []
                started_text = False
                for chunk in chunks:
                    chunk_type = getattr(chunk, "type", None)
                    if chunk_type is None and isinstance(chunk, dict):
                        chunk_type = chunk.get("type")
                    if chunk_type == "text_delta":
                        delta = getattr(chunk, "delta", None)
                        if delta is None and isinstance(chunk, dict):
                            delta = chunk.get("delta", "")
                        if not started_text:
                            yield PartStartEvent(index=0, part=TextPart(""))
                            yield FinalResultEvent(tool_name=None, tool_call_id=None)
                            started_text = True
                        text_parts.append(str(delta))
                        yield PartDeltaEvent(index=0, delta=TextPartDelta(str(delta)))
                    elif chunk_type == "completed":
                        usage = getattr(chunk, "usage", None)
                        if usage is None and isinstance(chunk, dict):
                            usage = chunk.get("usage", {})
                        if started_text:
                            yield PartEndEvent(index=0, part=TextPart("".join(text_parts)))
                        yield AgentRunResultEvent(
                            result=WorkflowResultStub("".join(text_parts), usage)
                        )
                        return
                    elif chunk_type == "error":
                        error_message = getattr(chunk, "error_message", None)
                        if error_message is None and isinstance(chunk, dict):
                            error_message = chunk.get("error_message")
                        raise RuntimeError(error_message or "provider stream failed")

            return _events()

    return AdapterBackedChatWorkflow


def test_chat_run_repository_lists_active_runs(migrated_db_session) -> None:
    chat_session = create_user_and_session(migrated_db_session)
    active_run = ChatRunFactory.build(
        session_id=chat_session.id,
        status="running",
        client_request_id="req-running",
    )
    finished_run = ChatRunFactory.build(
        session_id=chat_session.id,
        status="succeeded",
        client_request_id="req-finished",
    )
    migrated_db_session.add(active_run)
    migrated_db_session.add(finished_run)
    migrated_db_session.commit()

    repository = ChatRunRepository(migrated_db_session)
    active_runs = repository.list_active_runs(chat_session.user_id)

    assert [run.client_request_id for run in active_runs] == ["req-running"]


def test_chat_run_service_streams_runtime_events_and_persists_projection(
    migrated_db_session,
) -> None:
    chat_session = create_user_and_session(migrated_db_session)
    service, chat_repository, _, event_repository = build_chat_run_service(
        migrated_db_session,
        response_adapter=SimpleNamespace(
            stream_response=lambda *args, **kwargs: iter(
                [
                    {"type": "text_delta", "delta": "hello "},
                    {"type": "text_delta", "delta": "world"},
                    {"type": "completed", "usage": {"output_tokens": 2}},
                ]
            )
        ),
        retrieved_sources=[
            {
                "document_id": 7,
                "document_revision_id": 11,
                "document_name": "playbook.md",
                "chunk_id": "chunk-1",
                "snippet": "retrieved snippet",
                "page_number": None,
                "section_title": "Intro",
                "score": 0.82,
            }
        ],
    )

    events = list(
        service.stream_run(
            session_id=chat_session.id,
            content="question",
            client_request_id="req-stream-pydanticai-1",
        )
    )

    messages = chat_repository.list_messages(chat_session.id)
    assistant_message = next(message for message in messages if message.role == "assistant")
    persisted_events = event_repository.list_for_run(events[0]["data"]["run_id"])

    assert [event["event"] for event in events] == [
        "run.started",
        "message.started",
        "tool.call",
        "tool.result",
        "part.source",
        "part.text.start",
        "part.text.delta",
        "part.text.delta",
        "part.text.end",
        "usage.final",
        "message.completed",
        "run.completed",
    ]
    assert assistant_message.content == "hello world"
    assert assistant_message.status == "succeeded"
    assert assistant_message.sources_json == [
        {
            "document_id": 7,
            "document_revision_id": 11,
            "document_name": "playbook.md",
            "chunk_id": "chunk-1",
            "snippet": "retrieved snippet",
            "page_number": None,
            "section_title": "Intro",
            "score": 0.82,
        }
    ]
    assert len(persisted_events) == len(events)


def test_chat_run_service_replays_existing_run_for_duplicate_retry_client_request_id(
    migrated_db_session,
) -> None:
    class StreamingAdapterStub:
        def __init__(self) -> None:
            self.stream_calls = 0

        def stream_response(self, messages, settings):
            del messages, settings
            self.stream_calls += 1
            yield SimpleNamespace(type="text_delta", delta="hello ")
            yield SimpleNamespace(type="text_delta", delta="again")
            yield SimpleNamespace(type="completed", usage={"output_tokens": 2})

    adapter = StreamingAdapterStub()
    chat_session = create_user_and_session(migrated_db_session)
    service, chat_repository, _, event_repository = build_chat_run_service(
        migrated_db_session,
        response_adapter=adapter,
    )
    original_message = chat_repository.create_message(
        session_id=chat_session.id,
        role="user",
        content="question",
        status="failed",
        client_request_id="req-original-failed",
    )
    migrated_db_session.commit()
    migrated_db_session.refresh(original_message)

    first_events = list(
        service.stream_run(
            session_id=chat_session.id,
            content="question",
            client_request_id="req-retry-idempotent-1",
            retry_of_message_id=original_message.id,
        )
    )
    second_events = list(
        service.stream_run(
            session_id=chat_session.id,
            content="question",
            client_request_id="req-retry-idempotent-1",
            retry_of_message_id=original_message.id,
        )
    )

    first_run_id = first_events[0]["data"]["run_id"]
    second_run_id = second_events[0]["data"]["run_id"]
    messages = chat_repository.list_messages(chat_session.id)
    retried_messages = [
        message
        for message in messages
        if message.role == "user" and message.retry_of_message_id == original_message.id
    ]
    persisted_events = event_repository.list_for_run(first_run_id)

    assert first_run_id == second_run_id
    assert adapter.stream_calls == 1
    assert len(retried_messages) == 1
    assert [event.event_type for event in persisted_events] == [
        "run.started",
        "message.started",
        "tool.call",
        "tool.result",
        "part.text.start",
        "part.text.delta",
        "part.text.delta",
        "part.text.end",
        "usage.final",
        "message.completed",
        "run.completed",
    ]


def test_chat_run_service_marks_run_failed_when_stream_is_closed_early(
    migrated_db_session,
) -> None:
    class HangingStreamingAdapterStub:
        def stream_response(self, messages, settings):
            del messages, settings
            yield SimpleNamespace(type="text_delta", delta="partial")
            yield SimpleNamespace(type="text_delta", delta=" response")

    chat_session = create_user_and_session(migrated_db_session)
    service, chat_repository, run_repository, event_repository = build_chat_run_service(
        migrated_db_session,
        response_adapter=HangingStreamingAdapterStub(),
    )

    stream = service.stream_run(
        session_id=chat_session.id,
        content="question",
        client_request_id="req-stream-close-1",
    )
    first_event = next(stream)
    run_id = first_event["data"]["run_id"]

    stream.close()

    messages = chat_repository.list_messages(chat_session.id)
    assistant_message = next(message for message in messages if message.role == "assistant")
    chat_run = run_repository.get_run(run_id)
    replayed_events = list(
        service.stream_run(
            session_id=chat_session.id,
            content="question",
            client_request_id="req-stream-close-1",
        )
    )
    persisted_events = event_repository.list_for_run(run_id)

    assert assistant_message.status == "failed"
    assert assistant_message.error_message == "本次生成连接中断，请重试。"
    assert chat_run is not None
    assert chat_run.status == "failed"
    assert chat_run.error_message == "本次生成连接中断，请重试。"
    assert persisted_events[-1].event_type == "run.failed"
    assert replayed_events[-1]["event"] == "run.failed"


def test_chat_run_service_reads_reasoning_mode_from_dict_settings(
    migrated_db_session,
) -> None:
    class StreamingAdapterStub:
        def stream_response(self, messages, settings):
            del messages, settings
            yield SimpleNamespace(type="completed", usage={"output_tokens": 0})

    service, _, _, _ = build_chat_run_service(
        migrated_db_session,
        response_adapter=StreamingAdapterStub(),
    )
    service.settings = parse_runtime_settings(
        {
            "response_route": {"provider": "openai", "model": "gpt-5.4"},
            "reasoning_mode": "on",
        }
    )

    assert service.settings.response_route.provider == "openai"
    assert service.settings.response_route.model == "gpt-5.4"
    assert service._reasoning_mode() == "on"


def test_chat_run_service_marks_run_failed_when_provider_stream_ends_without_completed(
    migrated_db_session,
) -> None:
    class HangingStreamingAdapterStub:
        def stream_response(self, messages, settings):
            del messages, settings
            yield SimpleNamespace(type="text_delta", delta="partial")
            yield SimpleNamespace(type="text_delta", delta=" response")

    chat_session = create_user_and_session(migrated_db_session)
    service, chat_repository, run_repository, event_repository = build_chat_run_service(
        migrated_db_session,
        response_adapter=HangingStreamingAdapterStub(),
    )

    events = list(
        service.stream_run(
            session_id=chat_session.id,
            content="question",
            client_request_id="req-stream-eof-1",
        )
    )

    messages = chat_repository.list_messages(chat_session.id)
    assistant_message = next(message for message in messages if message.role == "assistant")
    chat_run = run_repository.get_run(events[0]["data"]["run_id"])
    persisted_events = event_repository.list_for_run(events[0]["data"]["run_id"])

    assert [event["event"] for event in events][-1] == "run.failed"
    assert assistant_message.status == "failed"
    assert assistant_message.error_message == "provider stream ended before completion"
    assert chat_run is not None
    assert chat_run.status == "failed"
    assert chat_run.error_message == "provider stream ended before completion"
    assert persisted_events[-1].event_type == "run.failed"


def test_chat_run_service_keeps_retrieved_sources_when_provider_returns_error(
    migrated_db_session,
    monkeypatch,
) -> None:
    class ProviderErrorStreamingAdapterStub:
        def stream_response(self, messages, settings):
            del messages, settings
            yield SimpleNamespace(type="error", error_message="provider stream failed")

    chat_session = create_user_and_session(migrated_db_session)
    service, chat_repository, run_repository, event_repository = build_chat_run_service(
        migrated_db_session,
        response_adapter=ProviderErrorStreamingAdapterStub(),
        retrieved_sources=[
            {
                "document_id": 7,
                "document_revision_id": 11,
                "document_name": "playbook.md",
                "chunk_id": "chunk-1",
                "snippet": "retrieved snippet",
                "page_number": None,
                "section_title": "Intro",
                "score": 0.82,
            }
        ],
    )

    events = list(
        service.stream_run(
            session_id=chat_session.id,
            content="question",
            client_request_id="req-stream-provider-error-1",
        )
    )

    messages = chat_repository.list_messages(chat_session.id)
    assistant_message = next(message for message in messages if message.role == "assistant")
    chat_run = run_repository.get_run(events[0]["data"]["run_id"])
    persisted_events = event_repository.list_for_run(events[0]["data"]["run_id"])

    assert [event["event"] for event in events] == [
        "run.started",
        "message.started",
        "tool.call",
        "tool.result",
        "part.source",
        "run.failed",
    ]
    assert assistant_message.status == "failed"
    assert assistant_message.error_message == "Chat processing failed."
    assert assistant_message.sources_json == [
        {
            "document_id": 7,
            "document_revision_id": 11,
            "document_name": "playbook.md",
            "chunk_id": "chunk-1",
            "snippet": "retrieved snippet",
            "page_number": None,
            "section_title": "Intro",
            "score": 0.82,
        }
    ]
    assert chat_run is not None
    assert chat_run.status == "failed"
    assert persisted_events[-1].event_type == "run.failed"


def test_chat_run_service_keeps_retrieved_sources_when_stream_is_closed_after_source_events(
    migrated_db_session,
    monkeypatch,
) -> None:
    class ShouldNotReachProviderAdapterStub:
        def stream_response(self, messages, settings):
            del messages, settings
            raise AssertionError("provider stream should not start after source events are closed")

    chat_session = create_user_and_session(migrated_db_session)
    service, chat_repository, run_repository, _ = build_chat_run_service(
        migrated_db_session,
        response_adapter=ShouldNotReachProviderAdapterStub(),
        retrieved_sources=[
            {
                "document_id": 9,
                "document_revision_id": 13,
                "document_name": "notes.md",
                "chunk_id": "chunk-2",
                "snippet": "cached source snippet",
                "page_number": None,
                "section_title": "Scope",
                "score": 0.74,
            }
        ],
    )

    stream = service.stream_run(
        session_id=chat_session.id,
        content="question",
        client_request_id="req-stream-close-after-source-1",
    )
    events = [next(stream) for _ in range(5)]
    run_id = events[0]["data"]["run_id"]

    stream.close()

    messages = chat_repository.list_messages(chat_session.id)
    assistant_message = next(message for message in messages if message.role == "assistant")
    chat_run = run_repository.get_run(run_id)

    assert [event["event"] for event in events] == [
        "run.started",
        "message.started",
        "tool.call",
        "tool.result",
        "part.source",
    ]
    assert assistant_message.status == "failed"
    assert assistant_message.error_message == "本次生成连接中断，请重试。"
    assert assistant_message.sources_json == [
        {
            "document_id": 9,
            "document_revision_id": 13,
            "document_name": "notes.md",
            "chunk_id": "chunk-2",
            "snippet": "cached source snippet",
            "page_number": None,
            "section_title": "Scope",
            "score": 0.74,
        }
    ]
    assert chat_run is not None
    assert chat_run.status == "failed"
    assert chat_run.error_message == "本次生成连接中断，请重试。"


def test_chat_stream_wrapper_closes_inner_run_stream_when_consumer_disconnects(
    migrated_db_session,
) -> None:
    class ShouldNotReachProviderAdapterStub:
        def stream_response(self, messages, settings):
            del messages, settings
            raise AssertionError(
                "provider stream should not start after the outer stream is closed"
            )

    chat_session = create_user_and_session(migrated_db_session)
    service, chat_repository, run_repository, _ = build_chat_run_service(
        migrated_db_session,
        response_adapter=ShouldNotReachProviderAdapterStub(),
    )

    stream = stream_presented_events(
        service.stream_run(
            session_id=chat_session.id,
            content="question",
            client_request_id="req-stream-wrapper-close-1",
        ),
        ChatStreamPresenter(),
    )

    first_chunk = next(stream)
    stream.close()

    messages = chat_repository.list_messages(chat_session.id)
    assistant_message = next(message for message in messages if message.role == "assistant")
    chat_run = run_repository.list_active_runs(chat_session.user_id)

    assert "event: run.started" in first_chunk
    assert assistant_message.status == "failed"
    assert assistant_message.error_message == "本次生成连接中断，请重试。"
    assert chat_run == []


def test_chat_run_service_assigns_event_seq_without_reloading_all_events(
    migrated_db_session,
) -> None:
    class StreamingAdapterStub:
        def stream_response(self, messages, settings):
            del messages, settings
            yield SimpleNamespace(type="text_delta", delta="hello ")
            yield SimpleNamespace(type="text_delta", delta="world")
            yield SimpleNamespace(type="completed", usage={"output_tokens": 2})

    class CountingRunEventRepository(ChatRunEventRepository):
        def __init__(self, session) -> None:
            super().__init__(session)
            self.list_for_run_calls = 0

        def list_for_run(self, run_id: int):
            self.list_for_run_calls += 1
            return super().list_for_run(run_id)

    chat_session = create_user_and_session(migrated_db_session)
    event_repository = CountingRunEventRepository(migrated_db_session)
    service, _, _, _ = build_chat_run_service(
        migrated_db_session,
        response_adapter=StreamingAdapterStub(),
        event_repository=event_repository,
    )

    list(
        service.stream_run(
            session_id=chat_session.id,
            content="question",
            client_request_id="req-stream-seq-1",
        )
    )

    assert event_repository.list_for_run_calls == 0


def test_chat_run_service_batches_commit_for_many_text_deltas(
    migrated_db_session,
) -> None:
    class ManyDeltaStreamingAdapterStub:
        def stream_response(self, messages, settings):
            del messages, settings
            for index in range(20):
                yield SimpleNamespace(type="text_delta", delta=f"chunk-{index} ")
            yield SimpleNamespace(type="completed", usage={"output_tokens": 20})

    chat_session = create_user_and_session(migrated_db_session)
    service, _, _, _ = build_chat_run_service(
        migrated_db_session,
        response_adapter=ManyDeltaStreamingAdapterStub(),
    )

    original_commit = migrated_db_session.commit
    commit_count = 0

    def counted_commit() -> None:
        nonlocal commit_count
        commit_count += 1
        original_commit()

    migrated_db_session.commit = counted_commit
    try:
        events = list(
            service.stream_run(
                session_id=chat_session.id,
                content="question",
                client_request_id="req-stream-batched-1",
            )
        )
    finally:
        migrated_db_session.commit = original_commit

    delta_events = [event for event in events if event["event"] == "part.text.delta"]

    assert len(delta_events) == 20
    assert commit_count < len(delta_events)
