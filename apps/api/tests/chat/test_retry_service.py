from __future__ import annotations

from fastapi.testclient import TestClient

from knowledge_chatbox_api.models.auth import User
from knowledge_chatbox_api.repositories.chat_repository import ChatRepository
from knowledge_chatbox_api.services.chat.retry_service import (
    DuplicateClientRequestConflictError,
    RetryService,
)


def create_user_and_session(migrated_db_session):
    user = User(
        username="alice",
        password_hash="hash",
        role="user",
        status="active",
        theme_preference="system",
    )
    migrated_db_session.add(user)
    migrated_db_session.commit()
    migrated_db_session.refresh(user)

    repository = ChatRepository(migrated_db_session)
    chat_session = repository.create_session(user.id, "Session")
    migrated_db_session.commit()
    migrated_db_session.refresh(chat_session)
    return user, chat_session, repository


def test_retry_service_reuses_same_client_request_id_for_identical_payload(
    migrated_db_session,
) -> None:
    _, chat_session, repository = create_user_and_session(migrated_db_session)
    service = RetryService(repository, migrated_db_session)

    first = service.create_or_reuse_user_message(
        session_id=chat_session.id,
        content="question",
        client_request_id="req-1",
    )
    second = service.create_or_reuse_user_message(
        session_id=chat_session.id,
        content="question",
        client_request_id="req-1",
    )

    assert first.id == second.id


def test_retry_service_rejects_same_client_request_id_for_different_payload(
    migrated_db_session,
) -> None:
    _, chat_session, repository = create_user_and_session(migrated_db_session)
    service = RetryService(repository, migrated_db_session)
    service.create_or_reuse_user_message(
        session_id=chat_session.id,
        content="question",
        client_request_id="req-1",
    )

    try:
        service.create_or_reuse_user_message(
            session_id=chat_session.id,
            content="different question",
            client_request_id="req-1",
        )
    except DuplicateClientRequestConflictError:
        pass
    else:
        raise AssertionError("expected DuplicateClientRequestConflictError")


def test_chat_api_can_delete_failed_user_message(api_client: TestClient, monkeypatch) -> None:
    class FailingResponseAdapter:
        def stream_response(self, messages, settings):
            del messages, settings
            yield {"type": "error", "error_message": "provider unavailable"}

    monkeypatch.setattr(
        "knowledge_chatbox_api.services.chat.chat_application_service.build_response_adapter_from_settings",
        lambda settings_record: FailingResponseAdapter(),
    )
    monkeypatch.setattr(
        "knowledge_chatbox_api.services.chat.chat_application_service.build_embedding_adapter_from_settings",
        lambda settings_record: None,
    )

    api_client.post("/api/auth/login", json={"username": "admin", "password": "admin123456"})
    session_response = api_client.post("/api/chat/sessions", json={"title": "Retry Session"})
    session_id = session_response.json()["data"]["id"]

    with api_client.stream(
        "POST",
        f"/api/chat/sessions/{session_id}/messages/stream",
        json={"content": "question", "client_request_id": "req-delete"},
    ) as response:
        response.read()

    messages = api_client.get(f"/api/chat/sessions/{session_id}/messages").json()["data"]
    user_message = next(message for message in messages if message["role"] == "user")

    delete_response = api_client.delete(f"/api/chat/messages/{user_message['id']}")

    assert response.status_code == 200
    assert delete_response.status_code == 200
    assert delete_response.json()["data"]["deleted"] is True
