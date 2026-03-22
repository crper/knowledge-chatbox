from __future__ import annotations

from types import SimpleNamespace

from knowledge_chatbox_api.api.routes.chat import stream_presented_events
from knowledge_chatbox_api.models.auth import User
from knowledge_chatbox_api.models.chat import ChatRun, ChatSession
from knowledge_chatbox_api.models.space import Space
from knowledge_chatbox_api.repositories.chat_repository import ChatRepository
from knowledge_chatbox_api.repositories.chat_run_event_repository import ChatRunEventRepository
from knowledge_chatbox_api.repositories.chat_run_repository import ChatRunRepository
from knowledge_chatbox_api.schemas.chat import ActiveChatRunRead, ChatRunRead
from knowledge_chatbox_api.services.chat.chat_run_service import ChatRunService
from knowledge_chatbox_api.services.chat.chat_stream_presenter import ChatStreamPresenter
from knowledge_chatbox_api.services.chat.retry_service import RetryService
from knowledge_chatbox_api.utils.chroma import InMemoryChromaStore


def create_user(migrated_db_session, username: str = "alice") -> User:
    user = User(
        username=username,
        password_hash="hash",
        role="user",
        status="active",
        theme_preference="system",
    )
    migrated_db_session.add(user)
    migrated_db_session.commit()
    migrated_db_session.refresh(user)
    return user


def create_chat_session(migrated_db_session) -> ChatSession:
    user = create_user(migrated_db_session)
    workspace = Space(
        owner_user_id=user.id,
        slug=f"workspace-{user.id}",
        name="workspace",
        kind="personal",
    )
    migrated_db_session.add(workspace)
    migrated_db_session.commit()
    migrated_db_session.refresh(workspace)

    chat_session = ChatSession(space_id=workspace.id, user_id=user.id, title="session")
    migrated_db_session.add(chat_session)
    migrated_db_session.commit()
    migrated_db_session.refresh(chat_session)
    return chat_session


def test_chat_run_supports_full_lifecycle_states(migrated_db_session) -> None:
    chat_session = create_chat_session(migrated_db_session)
    chat_run = ChatRun(
        session_id=chat_session.id,
        status="pending",
        response_provider="openai",
        response_model="gpt-5.4",
        client_request_id="req-1",
    )
    migrated_db_session.add(chat_run)
    migrated_db_session.commit()
    migrated_db_session.refresh(chat_run)

    chat_run.status = "running"
    migrated_db_session.commit()
    migrated_db_session.refresh(chat_run)
    assert chat_run.status == "running"

    chat_run.status = "succeeded"
    migrated_db_session.commit()
    migrated_db_session.refresh(chat_run)
    assert chat_run.status == "succeeded"

    chat_run.status = "cancelled"
    migrated_db_session.commit()
    migrated_db_session.refresh(chat_run)
    assert chat_run.status == "cancelled"


def test_chat_run_repository_lists_active_runs(migrated_db_session) -> None:
    chat_session = create_chat_session(migrated_db_session)
    active_run = ChatRun(
        session_id=chat_session.id,
        status="running",
        response_provider="openai",
        response_model="gpt-5.4",
        client_request_id="req-running",
    )
    finished_run = ChatRun(
        session_id=chat_session.id,
        status="succeeded",
        response_provider="openai",
        response_model="gpt-5.4",
        client_request_id="req-finished",
    )
    migrated_db_session.add(active_run)
    migrated_db_session.add(finished_run)
    migrated_db_session.commit()

    repository = ChatRunRepository(migrated_db_session)
    active_runs = repository.list_active_runs(chat_session.user_id)

    assert [run.client_request_id for run in active_runs] == ["req-running"]


def test_chat_run_read_schema_supports_from_attributes(migrated_db_session) -> None:
    chat_session = create_chat_session(migrated_db_session)
    chat_run = ChatRun(
        session_id=chat_session.id,
        status="pending",
        response_provider="openai",
        response_model="gpt-5.4",
        client_request_id="req-schema",
    )
    migrated_db_session.add(chat_run)
    migrated_db_session.commit()
    migrated_db_session.refresh(chat_run)

    payload = ChatRunRead.model_validate(chat_run, from_attributes=True)
    active_payload = ActiveChatRunRead.model_validate(chat_run, from_attributes=True)

    assert payload.id == chat_run.id
    assert active_payload.id == chat_run.id


def test_chat_run_service_streams_runtime_events_and_persists_projection(
    migrated_db_session,
) -> None:
    class StreamingAdapterStub:
        def stream_response(self, messages, settings):
            del messages, settings
            yield SimpleNamespace(type="text_delta", delta="hello ")
            yield SimpleNamespace(type="text_delta", delta="world")
            yield SimpleNamespace(type="completed", usage={"output_tokens": 2})

    chat_session = create_chat_session(migrated_db_session)
    chat_repository = ChatRepository(migrated_db_session)
    service = ChatRunService(
        session=migrated_db_session,
        chat_repository=chat_repository,
        chat_run_repository=ChatRunRepository(migrated_db_session),
        chat_run_event_repository=ChatRunEventRepository(migrated_db_session),
        retry_service=RetryService(chat_repository, migrated_db_session),
        chroma_store=InMemoryChromaStore(),
        response_adapter=StreamingAdapterStub(),
        embedding_adapter=None,
        settings=SimpleNamespace(
            response_route={"provider": "openai", "model": "gpt-5.4"},
            embedding_route={"provider": "openai", "model": "text-embedding-3-small"},
            system_prompt=None,
            active_index_generation=1,
        ),
        presenter=ChatStreamPresenter(),
    )

    events = list(
        service.stream_run(
            session_id=chat_session.id,
            content="question",
            client_request_id="req-stream-1",
        )
    )

    messages = chat_repository.list_messages(chat_session.id)
    assistant_message = next(message for message in messages if message.role == "assistant")
    persisted_events = ChatRunEventRepository(migrated_db_session).list_for_run(
        events[0]["data"]["run_id"]
    )

    assert [event["event"] for event in events] == [
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
    assert assistant_message.content == "hello world"
    assert assistant_message.status == "succeeded"
    assert len(persisted_events) == len(events)


def test_chat_run_service_marks_run_failed_when_stream_is_closed_early(
    migrated_db_session,
) -> None:
    class HangingStreamingAdapterStub:
        def stream_response(self, messages, settings):
            del messages, settings
            yield SimpleNamespace(type="text_delta", delta="partial")
            yield SimpleNamespace(type="text_delta", delta=" response")

    chat_session = create_chat_session(migrated_db_session)
    chat_repository = ChatRepository(migrated_db_session)
    run_repository = ChatRunRepository(migrated_db_session)
    service = ChatRunService(
        session=migrated_db_session,
        chat_repository=chat_repository,
        chat_run_repository=run_repository,
        chat_run_event_repository=ChatRunEventRepository(migrated_db_session),
        retry_service=RetryService(chat_repository, migrated_db_session),
        chroma_store=InMemoryChromaStore(),
        response_adapter=HangingStreamingAdapterStub(),
        embedding_adapter=None,
        settings=SimpleNamespace(
            response_route={"provider": "openai", "model": "gpt-5.4"},
            embedding_route={"provider": "openai", "model": "text-embedding-3-small"},
            system_prompt=None,
            active_index_generation=1,
        ),
        presenter=ChatStreamPresenter(),
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

    assert assistant_message.status == "failed"
    assert assistant_message.error_message == "本次生成连接中断，请重试。"
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

    chat_session = create_chat_session(migrated_db_session)
    chat_repository = ChatRepository(migrated_db_session)
    run_repository = ChatRunRepository(migrated_db_session)
    service = ChatRunService(
        session=migrated_db_session,
        chat_repository=chat_repository,
        chat_run_repository=run_repository,
        chat_run_event_repository=ChatRunEventRepository(migrated_db_session),
        retry_service=RetryService(chat_repository, migrated_db_session),
        chroma_store=InMemoryChromaStore(),
        response_adapter=ShouldNotReachProviderAdapterStub(),
        embedding_adapter=None,
        settings=SimpleNamespace(
            response_route={"provider": "openai", "model": "gpt-5.4"},
            embedding_route={"provider": "openai", "model": "text-embedding-3-small"},
            system_prompt=None,
            active_index_generation=1,
        ),
        presenter=ChatStreamPresenter(),
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

    chat_session = create_chat_session(migrated_db_session)
    chat_repository = ChatRepository(migrated_db_session)
    event_repository = CountingRunEventRepository(migrated_db_session)
    service = ChatRunService(
        session=migrated_db_session,
        chat_repository=chat_repository,
        chat_run_repository=ChatRunRepository(migrated_db_session),
        chat_run_event_repository=event_repository,
        retry_service=RetryService(chat_repository, migrated_db_session),
        chroma_store=InMemoryChromaStore(),
        response_adapter=StreamingAdapterStub(),
        embedding_adapter=None,
        settings=SimpleNamespace(
            response_route={"provider": "openai", "model": "gpt-5.4"},
            embedding_route={"provider": "openai", "model": "text-embedding-3-small"},
            system_prompt=None,
            active_index_generation=1,
        ),
        presenter=ChatStreamPresenter(),
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

    chat_session = create_chat_session(migrated_db_session)
    chat_repository = ChatRepository(migrated_db_session)
    service = ChatRunService(
        session=migrated_db_session,
        chat_repository=chat_repository,
        chat_run_repository=ChatRunRepository(migrated_db_session),
        chat_run_event_repository=ChatRunEventRepository(migrated_db_session),
        retry_service=RetryService(chat_repository, migrated_db_session),
        chroma_store=InMemoryChromaStore(),
        response_adapter=ManyDeltaStreamingAdapterStub(),
        embedding_adapter=None,
        settings=SimpleNamespace(
            response_route={"provider": "openai", "model": "gpt-5.4"},
            embedding_route={"provider": "openai", "model": "text-embedding-3-small"},
            system_prompt=None,
            active_index_generation=1,
        ),
        presenter=ChatStreamPresenter(),
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
