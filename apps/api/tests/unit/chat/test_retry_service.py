from __future__ import annotations

import pytest
from fastapi.testclient import TestClient
from tests.fixtures.factories import UserFactory
from tests.fixtures.stubs import make_adapter_backed_chat_workflow_class

from knowledge_chatbox_api.repositories.chat_repository import ChatRepository
from knowledge_chatbox_api.services.chat.retry_service import (
    DuplicateClientRequestConflictError,
    RetryService,
    RetryTargetNotFoundError,
)


def create_user_and_session(migrated_db_session):
    user = UserFactory.persisted_create(migrated_db_session, username="alice")
    repository = ChatRepository(migrated_db_session)
    chat_session = repository.create_session(user.id, "Session")
    migrated_db_session.commit()
    migrated_db_session.refresh(chat_session)
    return user, chat_session, repository


@pytest.mark.unit
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


@pytest.mark.unit
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

    with pytest.raises(DuplicateClientRequestConflictError):
        service.create_or_reuse_user_message(
            session_id=chat_session.id,
            content="different question",
            client_request_id="req-1",
        )


@pytest.mark.unit
def test_retry_service_retry_user_message_succeeds(migrated_db_session) -> None:
    _, chat_session, repository = create_user_and_session(migrated_db_session)
    service = RetryService(repository, migrated_db_session)

    original = service.create_or_reuse_user_message(
        session_id=chat_session.id,
        content="original question",
        client_request_id="req-original",
    )

    retried = service.retry_user_message(
        session_id=chat_session.id,
        content="original question",
        client_request_id="req-retry",
        retry_of_message_id=original.id,
    )

    assert retried.content == original.content
    assert retried.retry_of_message_id == original.id


@pytest.mark.unit
def test_retry_service_retry_user_message_reuses_same_client_request_id(
    migrated_db_session,
) -> None:
    _, chat_session, repository = create_user_and_session(migrated_db_session)
    service = RetryService(repository, migrated_db_session)

    original = service.create_or_reuse_user_message(
        session_id=chat_session.id,
        content="original question",
        client_request_id="req-original",
    )

    first_retry = service.retry_user_message(
        session_id=chat_session.id,
        content="ignored content",
        client_request_id="req-retry",
        retry_of_message_id=original.id,
    )
    second_retry = service.retry_user_message(
        session_id=chat_session.id,
        content="still ignored",
        client_request_id="req-retry",
        retry_of_message_id=original.id,
    )

    assert first_retry.id == second_retry.id
    assert second_retry.retry_of_message_id == original.id


@pytest.mark.unit
def test_retry_service_retry_user_message_fails_for_nonexistent_message(
    migrated_db_session,
) -> None:
    _, chat_session, repository = create_user_and_session(migrated_db_session)
    service = RetryService(repository, migrated_db_session)

    with pytest.raises(RetryTargetNotFoundError):
        service.retry_user_message(
            session_id=chat_session.id,
            content="question",
            client_request_id="req-retry",
            retry_of_message_id=99999,
        )


@pytest.mark.unit
def test_retry_service_retry_user_message_fails_for_wrong_session(
    migrated_db_session,
) -> None:
    _, chat_session, repository = create_user_and_session(migrated_db_session)
    service = RetryService(repository, migrated_db_session)

    original = service.create_or_reuse_user_message(
        session_id=chat_session.id,
        content="original question",
        client_request_id="req-original",
    )

    with pytest.raises(RetryTargetNotFoundError):
        service.retry_user_message(
            session_id=99999,
            content="question",
            client_request_id="req-retry",
            retry_of_message_id=original.id,
        )


@pytest.mark.unit
def test_retry_service_create_assistant_reply_succeeds(migrated_db_session) -> None:
    _, chat_session, repository = create_user_and_session(migrated_db_session)
    service = RetryService(repository, migrated_db_session)

    user_message = service.create_or_reuse_user_message(
        session_id=chat_session.id,
        content="question",
        client_request_id="req-1",
    )

    assistant_reply = service.create_assistant_reply(
        session_id=chat_session.id,
        reply_to_message_id=user_message.id,
        content="assistant response",
    )

    assert assistant_reply.role == "assistant"
    assert assistant_reply.content == "assistant response"
    assert assistant_reply.status == "pending"
    assert assistant_reply.reply_to_message_id == user_message.id


@pytest.mark.integration
@pytest.mark.requires_db
def test_chat_api_can_delete_failed_user_message(api_client: TestClient, monkeypatch) -> None:
    from tests.fixtures.helpers import login_as_admin

    class FailingStreamResponseAdapter:
        def stream_response(self, messages, settings):
            del messages, settings
            yield {"type": "error", "error_message": "provider unavailable"}

    workflow_cls = make_adapter_backed_chat_workflow_class(
        response_adapter=FailingStreamResponseAdapter()
    )
    monkeypatch.setattr(
        "knowledge_chatbox_api.services.chat.chat_run_service.ChatWorkflow",
        workflow_cls,
    )

    login_as_admin(api_client)
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
