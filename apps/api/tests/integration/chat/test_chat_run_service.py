from __future__ import annotations

from types import SimpleNamespace
from typing import TYPE_CHECKING, Any, cast

if TYPE_CHECKING:
    from collections.abc import AsyncIterator, Callable

    from knowledge_chatbox_api.providers.base import EmbeddingAdapterProtocol
    from knowledge_chatbox_api.services.chat.stream_events import StreamEventEnvelope
    from knowledge_chatbox_api.services.settings.runtime_settings import ProviderRuntimeSettings

from pydantic_ai import AgentRunResultEvent
from tests.fixtures.factories import (
    ChatRunFactory,
    ChatSessionFactory,
    SpaceFactory,
    UserFactory,
)
from tests.fixtures.stubs import (
    InMemoryChromaStore,
    TextResponseAdapterStub,
    WorkflowRunResultStub,
    make_chat_run_service_workflow_factory,
)

from knowledge_chatbox_api.api.routes.chat import stream_presented_events
from knowledge_chatbox_api.models.enums import (
    EmbeddingProvider,
    ReasoningMode,
    ResponseProvider,
    VisionProvider,
)
from knowledge_chatbox_api.repositories.chat_repository import ChatRepository
from knowledge_chatbox_api.repositories.chat_run_event_repository import ChatRunEventRepository
from knowledge_chatbox_api.repositories.chat_run_repository import ChatRunRepository
from knowledge_chatbox_api.schemas.settings import (
    EmbeddingRouteConfig,
    ProviderProfiles,
    ProviderRuntimeSettings,
    ResponseRouteConfig,
    VisionRouteConfig,
)
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

    return ChatSessionFactory.persisted_create(
        migrated_db_session,
        space_id=workspace.id,
        user_id=user.id,
        title="session",
    )


def build_chat_run_service(
    migrated_db_session,
    *,
    response_adapter: Any,
    event_repository: ChatRunEventRepository | None = None,
    retrieved_sources: list[dict[str, Any]] | None = None,
    workflow_factory: type | None = None,
):
    chat_repository = ChatRepository(migrated_db_session)
    run_repository = ChatRunRepository(migrated_db_session)
    active_event_repository = event_repository or ChatRunEventRepository(migrated_db_session)
    active_workflow_factory: type = workflow_factory or make_chat_run_service_workflow_factory(
        response_adapter,
        retrieved_sources=retrieved_sources,
    )

    service = ChatRunService(
        session=migrated_db_session,
        chat_repository=chat_repository,
        chat_run_repository=run_repository,
        chat_run_event_repository=active_event_repository,
        retry_service=RetryService(chat_repository),
        chroma_store=InMemoryChromaStore(),
        embedding_adapter=cast("EmbeddingAdapterProtocol", None),
        settings=ProviderRuntimeSettings(
            provider_profiles=ProviderProfiles(),
            response_route=ResponseRouteConfig(provider=ResponseProvider.OPENAI, model="gpt-5.4"),
            embedding_route=EmbeddingRouteConfig(
                provider=EmbeddingProvider.OPENAI, model="text-embedding-3-small"
            ),
            vision_route=VisionRouteConfig(provider=VisionProvider.OPENAI, model="gpt-4o-mini"),
            system_prompt=None,
            provider_timeout_seconds=60,
            active_index_generation=1,
            reasoning_mode=ReasoningMode.DEFAULT,
        ),
        workflow_factory=active_workflow_factory,
        presenter=ChatStreamPresenter(),
    )
    return service, chat_repository, run_repository, active_event_repository


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
    def _stream_response(*_args: object, **_kwargs: object):
        del _args, _kwargs
        return iter(
            [
                {"type": "text_delta", "delta": "hello "},
                {"type": "text_delta", "delta": "world"},
                {"type": "completed", "usage": {"output_tokens": 2}},
            ]
        )

    chat_session = create_user_and_session(migrated_db_session)
    service, chat_repository, _, event_repository = build_chat_run_service(
        migrated_db_session,
        response_adapter=SimpleNamespace(stream_response=_stream_response),
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
    assert events[0].data.run_id is not None
    persisted_events = event_repository.list_for_run(events[0].data.run_id)

    assert [event.event for event in events] == [
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
    adapter = TextResponseAdapterStub(stream_chunks=["hello ", "again"])
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

    assert first_events[0].data.run_id is not None
    assert second_events[0].data.run_id is not None
    first_run_id = first_events[0].data.run_id
    second_run_id = second_events[0].data.run_id
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
    chat_session = create_user_and_session(migrated_db_session)
    service, chat_repository, run_repository, event_repository = build_chat_run_service(
        migrated_db_session,
        response_adapter=TextResponseAdapterStub(
            stream_chunks=["partial", " response"],
            emit_completed=False,
        ),
    )

    stream = service.stream_run(
        session_id=chat_session.id,
        content="question",
        client_request_id="req-stream-close-1",
    )
    first_event: StreamEventEnvelope = next(stream)
    run_id = first_event.data.run_id
    assert run_id is not None

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
    assert replayed_events[-1].event == "run.failed"


def test_chat_run_service_completes_when_workflow_only_emits_final_result(
    migrated_db_session,
) -> None:
    class FinalOnlyChatWorkflow:
        def run_stream_events(
            self,
            *,
            deps,
            session_id: int,
            question: str,
            attachments=None,
        ) -> AsyncIterator[object]:
            del deps, session_id, attachments

            async def _events() -> AsyncIterator[object]:
                yield AgentRunResultEvent(
                    result=cast(
                        "Any",
                        WorkflowRunResultStub(question.upper(), {"output_tokens": 1}),
                    )
                )

            return _events()

    chat_session = create_user_and_session(migrated_db_session)
    service, chat_repository, run_repository, event_repository = build_chat_run_service(
        migrated_db_session,
        response_adapter=SimpleNamespace(),
        workflow_factory=FinalOnlyChatWorkflow,
    )

    events = list(
        service.stream_run(
            session_id=chat_session.id,
            content="direct answer",
            client_request_id="req-stream-final-only-1",
        )
    )

    messages = chat_repository.list_messages(chat_session.id)
    assistant_message = next(message for message in messages if message.role == "assistant")
    assert events[0].data.run_id is not None
    chat_run = run_repository.get_run(events[0].data.run_id)
    persisted_events = event_repository.list_for_run(events[0].data.run_id)

    assert [event.event for event in events] == [
        "run.started",
        "message.started",
        "usage.final",
        "message.completed",
        "run.completed",
    ]
    assert assistant_message.content == "DIRECT ANSWER"
    assert assistant_message.status == "succeeded"
    assert chat_run is not None
    assert chat_run.status == "succeeded"
    assert persisted_events[-1].event_type == "run.completed"


def test_chat_run_service_reads_reasoning_mode_from_dict_settings(
    migrated_db_session,
) -> None:
    service, _, _, _ = build_chat_run_service(
        migrated_db_session,
        response_adapter=TextResponseAdapterStub(stream_chunks=[], output_tokens=0),
    )
    service.settings = parse_runtime_settings(
        {
            "provider_profiles": {},
            "response_route": {"provider": "openai", "model": "gpt-5.4"},
            "embedding_route": {"provider": "openai", "model": "text-embedding-3-small"},
            "vision_route": {"provider": "openai", "model": "gpt-4o-mini"},
            "provider_timeout_seconds": 60,
            "reasoning_mode": "on",
        }
    )

    assert service.settings.response_route.provider == "openai"
    assert service.settings.response_route.model == "gpt-5.4"
    assert service.settings.reasoning_mode == "on"


def test_chat_run_service_marks_run_failed_when_provider_stream_ends_without_completed(
    migrated_db_session,
) -> None:
    chat_session = create_user_and_session(migrated_db_session)
    service, chat_repository, run_repository, event_repository = build_chat_run_service(
        migrated_db_session,
        response_adapter=TextResponseAdapterStub(
            stream_chunks=["partial", " response"],
            emit_completed=False,
        ),
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
    assert events[0].data.run_id is not None
    chat_run = run_repository.get_run(events[0].data.run_id)
    persisted_events = event_repository.list_for_run(events[0].data.run_id)

    assert [event.event for event in events][-1] == "run.failed"
    assert assistant_message.status == "failed"
    assert assistant_message.error_message == "provider stream ended before completion"
    assert chat_run is not None
    assert chat_run.status == "failed"
    assert chat_run.error_message == "provider stream ended before completion"
    assert persisted_events[-1].event_type == "run.failed"


def test_chat_run_service_keeps_retrieved_sources_when_provider_returns_error(
    migrated_db_session,
) -> None:
    chat_session = create_user_and_session(migrated_db_session)
    service, chat_repository, run_repository, event_repository = build_chat_run_service(
        migrated_db_session,
        response_adapter=TextResponseAdapterStub(stream_error_message="provider stream failed"),
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
    assert events[0].data.run_id is not None
    chat_run = run_repository.get_run(events[0].data.run_id)
    persisted_events = event_repository.list_for_run(events[0].data.run_id)

    assert [event.event for event in events] == [
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
) -> None:
    chat_session = create_user_and_session(migrated_db_session)
    service, chat_repository, run_repository, _ = build_chat_run_service(
        migrated_db_session,
        response_adapter=TextResponseAdapterStub(
            raise_on_stream_message=(
                "provider stream should not start after source events are closed"
            )
        ),
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
    events: list[StreamEventEnvelope] = [next(stream) for _ in range(5)]
    run_id = events[0].data.run_id
    assert run_id is not None

    stream.close()

    messages = chat_repository.list_messages(chat_session.id)
    assistant_message = next(message for message in messages if message.role == "assistant")
    chat_run = run_repository.get_run(run_id)

    assert [event.event for event in events] == [
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
    chat_session = create_user_and_session(migrated_db_session)
    service, chat_repository, run_repository, _ = build_chat_run_service(
        migrated_db_session,
        response_adapter=TextResponseAdapterStub(
            raise_on_stream_message=(
                "provider stream should not start after the outer stream is closed"
            )
        ),
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

    assert first_chunk["event"] == "run.started"
    assert assistant_message.status == "failed"
    assert assistant_message.error_message == "本次生成连接中断，请重试。"
    assert chat_run == []


def test_chat_run_service_assigns_event_seq_without_reloading_all_events(
    migrated_db_session,
) -> None:
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
        response_adapter=TextResponseAdapterStub(stream_chunks=["hello ", "world"]),
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
    chat_session = create_user_and_session(migrated_db_session)
    service, _, _, _ = build_chat_run_service(
        migrated_db_session,
        response_adapter=TextResponseAdapterStub(
            stream_chunks=[f"chunk-{index} " for index in range(20)],
            output_tokens=20,
        ),
    )

    original_commit: Callable[[], None] = migrated_db_session.commit
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

    delta_events = [event for event in events if event.event == "part.text.delta"]

    assert len(delta_events) == 20
    assert commit_count < len(delta_events)
