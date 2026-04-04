from __future__ import annotations

import json

from fastapi.testclient import TestClient


class UnifiedResponseAdapterStub:
    def response(self, messages, settings) -> str:
        del messages, settings
        return "统一回答"

    def stream_response(self, messages, settings):
        del messages, settings
        yield {"type": "text_delta", "delta": "统一"}
        yield {"type": "text_delta", "delta": "回答"}
        yield {"type": "completed", "usage": {"output_tokens": 2}}


class UnifiedFailingResponseAdapterStub:
    def response(self, messages, settings) -> str:
        del messages, settings
        raise RuntimeError("provider backend unavailable")

    def stream_response(self, messages, settings):
        del messages, settings
        yield {"type": "error", "error_message": "provider backend unavailable"}


class EmbeddingAdapterStub:
    def embed(self, texts: list[str], settings) -> list[list[float]]:
        del texts, settings
        return [[0.1] * 384]


def stub_document_index_embedding(monkeypatch) -> None:
    monkeypatch.setattr(
        "knowledge_chatbox_api.services.documents.ingestion_service.build_embedding_adapter",
        lambda _route: EmbeddingAdapterStub(),
    )


def login_admin(api_client: TestClient) -> None:
    response = api_client.post(
        "/api/auth/login",
        json={"username": "admin", "password": "admin123456"},
    )
    assert response.status_code == 200


def create_chat_session(api_client: TestClient, title: str) -> int:
    response = api_client.post("/api/chat/sessions", json={"title": title})
    assert response.status_code == 201
    return response.json()["data"]["id"]


def read_session_messages(api_client: TestClient, session_id: int) -> list[dict]:
    response = api_client.get(f"/api/chat/sessions/{session_id}/messages")
    assert response.status_code == 200
    return response.json()["data"]


def read_run_id(stream_body: str) -> int:
    current_event: str | None = None
    for line in stream_body.splitlines():
        if line.startswith("event: "):
            current_event = line.removeprefix("event: ").strip()
            continue
        if current_event == "run.started" and line.startswith("data: "):
            payload = json.loads(line.removeprefix("data: ").strip())
            return payload["run_id"]
    raise AssertionError("run.started event not found")


def pick_user_and_assistant(messages: list[dict]) -> tuple[dict, dict]:
    assert len(messages) == 2
    user_message = next(message for message in messages if message["role"] == "user")
    assistant_message = next(message for message in messages if message["role"] == "assistant")
    return user_message, assistant_message


def comparable_message_fields(message: dict) -> dict:
    return {
        "attachments_json": message["attachments_json"],
        "content": message["content"],
        "error_message": message["error_message"],
        "role": message["role"],
        "sources_json": message["sources_json"],
        "status": message["status"],
    }


def test_sync_and_stream_chat_produce_equivalent_successful_messages_and_sources(
    api_client: TestClient,
    configure_upload_provider,
    monkeypatch,
) -> None:
    del configure_upload_provider
    stub_document_index_embedding(monkeypatch)
    monkeypatch.setattr(
        "knowledge_chatbox_api.services.chat.chat_application_service.build_response_adapter_from_settings",
        lambda _settings_record: UnifiedResponseAdapterStub(),
    )
    monkeypatch.setattr(
        "knowledge_chatbox_api.services.chat.chat_application_service.build_embedding_adapter_from_settings",
        lambda _settings_record: EmbeddingAdapterStub(),
    )

    login_admin(api_client)
    upload_response = api_client.post(
        "/api/documents/upload",
        files={
            "file": (
                "guide.txt",
                b"OpenAI provider setup guide.\nUse the API key and base URL for setup.",
                "text/plain",
            )
        },
    )
    assert upload_response.status_code == 201

    sync_session_id = create_chat_session(api_client, "sync session")
    stream_session_id = create_chat_session(api_client, "stream session")
    request_payload = {
        "content": "How do I set up OpenAI?",
        "client_request_id": "req-chat-equivalence-success-1",
    }

    sync_response = api_client.post(
        f"/api/chat/sessions/{sync_session_id}/messages",
        json=request_payload,
    )
    assert sync_response.status_code == 200
    sync_user_message = sync_response.json()["data"]["user_message"]
    sync_assistant_message = sync_response.json()["data"]["assistant_message"]

    with api_client.stream(
        "POST",
        f"/api/chat/sessions/{stream_session_id}/messages/stream",
        json={
            **request_payload,
            "client_request_id": "req-chat-equivalence-success-2",
        },
    ) as response:
        stream_body = response.read().decode()

    assert response.status_code == 200
    assert read_run_id(stream_body) > 0
    stream_user_message, stream_assistant_message = pick_user_and_assistant(
        read_session_messages(api_client, stream_session_id)
    )

    assert comparable_message_fields(sync_user_message) == comparable_message_fields(
        stream_user_message
    )
    assert comparable_message_fields(sync_assistant_message) == comparable_message_fields(
        stream_assistant_message
    )
    assert sync_assistant_message["sources_json"]


def test_sync_and_stream_chat_produce_equivalent_failure_messages(
    api_client: TestClient,
    monkeypatch,
) -> None:
    stub_document_index_embedding(monkeypatch)
    monkeypatch.setattr(
        "knowledge_chatbox_api.services.chat.chat_application_service.build_response_adapter_from_settings",
        lambda _settings_record: UnifiedFailingResponseAdapterStub(),
    )
    monkeypatch.setattr(
        "knowledge_chatbox_api.services.chat.chat_application_service.build_embedding_adapter_from_settings",
        lambda _settings_record: EmbeddingAdapterStub(),
    )

    login_admin(api_client)
    sync_session_id = create_chat_session(api_client, "sync failure session")
    stream_session_id = create_chat_session(api_client, "stream failure session")
    request_payload = {
        "content": "Please fail",
        "client_request_id": "req-chat-equivalence-failure-1",
    }

    sync_response = api_client.post(
        f"/api/chat/sessions/{sync_session_id}/messages",
        json=request_payload,
    )
    assert sync_response.status_code == 200
    sync_user_message = sync_response.json()["data"]["user_message"]
    sync_assistant_message = sync_response.json()["data"]["assistant_message"]

    with api_client.stream(
        "POST",
        f"/api/chat/sessions/{stream_session_id}/messages/stream",
        json={
            **request_payload,
            "client_request_id": "req-chat-equivalence-failure-2",
        },
    ) as response:
        stream_body = response.read().decode()

    assert response.status_code == 200
    assert "event: run.failed" in stream_body
    stream_user_message, stream_assistant_message = pick_user_and_assistant(
        read_session_messages(api_client, stream_session_id)
    )

    assert comparable_message_fields(sync_user_message) == comparable_message_fields(
        stream_user_message
    )
    assert comparable_message_fields(sync_assistant_message) == comparable_message_fields(
        stream_assistant_message
    )
