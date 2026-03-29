from __future__ import annotations

from fastapi.testclient import TestClient


class SyncResponseAdapterStub:
    def response(self, messages, settings) -> str:
        del messages, settings
        return "同步回答"


class EmbeddingAdapterStub:
    def embed(self, texts: list[str], settings) -> list[list[float]]:
        del texts, settings
        return [[0.1] * 8]


def login_as_admin(api_client: TestClient) -> None:
    response = api_client.post(
        "/api/auth/login",
        json={"username": "admin", "password": "admin123456"},
    )

    assert response.status_code == 200


def create_chat_session(api_client: TestClient, title: str = "同步会话") -> int:
    response = api_client.post("/api/chat/sessions", json={"title": title})

    assert response.status_code == 201
    return response.json()["data"]["id"]


def test_create_message_api_returns_chat_message_pair(api_client: TestClient, monkeypatch) -> None:
    monkeypatch.setattr(
        "knowledge_chatbox_api.services.chat.chat_application_service.build_response_adapter_from_settings",
        lambda settings_record: SyncResponseAdapterStub(),
    )
    monkeypatch.setattr(
        "knowledge_chatbox_api.services.chat.chat_application_service.build_embedding_adapter_from_settings",
        lambda settings_record: EmbeddingAdapterStub(),
    )

    login_as_admin(api_client)
    session_id = create_chat_session(api_client)

    response = api_client.post(
        f"/api/chat/sessions/{session_id}/messages",
        json={
            "content": "请直接回答",
            "client_request_id": "req-chat-sync-1",
        },
    )

    payload = response.json()

    assert response.status_code == 200
    assert payload["success"] is True
    assert payload["data"]["user_message"]["content"] == "请直接回答"
    assert payload["data"]["assistant_message"]["content"] == "同步回答"
    assert payload["data"]["user_message"]["attachments_json"] is None
    assert payload["data"]["assistant_message"]["attachments_json"] is None


def test_list_messages_api_keeps_full_history_behavior_without_pagination_params(
    api_client: TestClient,
    monkeypatch,
) -> None:
    monkeypatch.setattr(
        "knowledge_chatbox_api.services.chat.chat_application_service.build_response_adapter_from_settings",
        lambda settings_record: SyncResponseAdapterStub(),
    )
    monkeypatch.setattr(
        "knowledge_chatbox_api.services.chat.chat_application_service.build_embedding_adapter_from_settings",
        lambda settings_record: EmbeddingAdapterStub(),
    )

    login_as_admin(api_client)
    session_id = create_chat_session(api_client, title="历史会话")

    create_response = api_client.post(
        f"/api/chat/sessions/{session_id}/messages",
        json={
            "content": "第一条消息",
            "client_request_id": "req-chat-sync-history-1",
        },
    )

    payload = create_response.json()["data"]
    user_message_id = payload["user_message"]["id"]
    assistant_message_id = payload["assistant_message"]["id"]

    response = api_client.get(f"/api/chat/sessions/{session_id}/messages")
    messages = response.json()["data"]

    assert response.status_code == 200
    assert [message["id"] for message in messages] == [user_message_id, assistant_message_id]
    assert messages[0]["role"] == "user"
    assert messages[1]["role"] == "assistant"
    assert messages[0]["attachments_json"] is None
