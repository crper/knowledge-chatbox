from __future__ import annotations

from types import SimpleNamespace

from knowledge_chatbox_api.core.config import get_settings
from knowledge_chatbox_api.models.auth import User
from knowledge_chatbox_api.repositories.chat_repository import ChatRepository
from knowledge_chatbox_api.repositories.chat_run_event_repository import ChatRunEventRepository
from knowledge_chatbox_api.repositories.chat_run_repository import ChatRunRepository
from knowledge_chatbox_api.services.chat.chat_run_service import ChatRunService
from knowledge_chatbox_api.services.chat.chat_stream_presenter import ChatStreamPresenter
from knowledge_chatbox_api.services.chat.retry_service import RetryService
from knowledge_chatbox_api.services.documents.ingestion_service import IngestionService
from knowledge_chatbox_api.utils.chroma import InMemoryChromaStore


def seed_admin(migrated_db_session) -> User:
    user = User(
        username="admin",
        password_hash="hash",
        role="admin",
        status="active",
        theme_preference="system",
    )
    migrated_db_session.add(user)
    migrated_db_session.commit()
    migrated_db_session.refresh(user)
    return user


def test_chat_run_service_persists_runtime_events_and_updates_message_projection(
    migrated_db_session,
) -> None:
    class StreamingProviderStub:
        def stream_response(self, messages, settings):
            del messages, settings
            yield {"type": "text_delta", "delta": "hello "}
            yield {"type": "text_delta", "delta": "world"}
            yield {"type": "completed", "usage": {"output_tokens": 2}}

    chat_repository = ChatRepository(migrated_db_session)
    session = chat_repository.create_session(user_id=seed_admin(migrated_db_session).id, title="S")
    migrated_db_session.commit()
    migrated_db_session.refresh(session)

    service = ChatRunService(
        session=migrated_db_session,
        chat_repository=chat_repository,
        chat_run_repository=ChatRunRepository(migrated_db_session),
        chat_run_event_repository=ChatRunEventRepository(migrated_db_session),
        retry_service=RetryService(chat_repository, migrated_db_session),
        chroma_store=InMemoryChromaStore(),
        response_adapter=StreamingProviderStub(),
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
            session_id=session.id,
            content="question",
            client_request_id="req-runtime-1",
        )
    )

    persisted_events = ChatRunEventRepository(migrated_db_session).list_for_run(
        events[0]["data"]["run_id"]
    )
    messages = chat_repository.list_messages(session.id)
    assistant_message = next(message for message in messages if message.role == "assistant")

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
    assert assistant_message.content == "hello world"
    assert assistant_message.status == "succeeded"


def test_ingestion_service_builds_fresh_indexing_service_per_target_settings(
    migrated_db_session,
    monkeypatch,
) -> None:
    build_calls: list[str] = []

    def build_embedding_adapter_stub(route):
        model = route["model"] if isinstance(route, dict) else route.model
        build_calls.append(model)
        return SimpleNamespace(model=model)

    monkeypatch.setattr(
        "knowledge_chatbox_api.services.documents.ingestion_service.build_embedding_adapter",
        build_embedding_adapter_stub,
    )

    service = IngestionService(migrated_db_session, get_settings())
    first_settings = SimpleNamespace(
        embedding_route={"provider": "openai", "model": "text-embedding-3-small"}
    )
    second_settings = SimpleNamespace(
        embedding_route={"provider": "openai", "model": "text-embedding-3-large"}
    )

    first_indexing_service = service._build_indexing_service(first_settings)
    second_indexing_service = service._build_indexing_service(second_settings)

    assert first_indexing_service is not second_indexing_service
    assert first_indexing_service.settings is first_settings
    assert second_indexing_service.settings is second_settings
    assert first_indexing_service.embedding_provider.model == "text-embedding-3-small"
    assert second_indexing_service.embedding_provider.model == "text-embedding-3-large"
    assert build_calls == ["text-embedding-3-small", "text-embedding-3-large"]
