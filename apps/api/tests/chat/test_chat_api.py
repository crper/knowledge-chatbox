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


def test_create_message_api_returns_chat_message_pair(api_client: TestClient, monkeypatch) -> None:
    monkeypatch.setattr(
        "knowledge_chatbox_api.services.chat.chat_application_service.build_response_adapter_from_settings",
        lambda settings_record: SyncResponseAdapterStub(),
    )
    monkeypatch.setattr(
        "knowledge_chatbox_api.services.chat.chat_application_service.build_embedding_adapter_from_settings",
        lambda settings_record: EmbeddingAdapterStub(),
    )

    api_client.post("/api/auth/login", json={"username": "admin", "password": "admin123456"})
    session_response = api_client.post("/api/chat/sessions", json={"title": "同步会话"})
    session_id = session_response.json()["data"]["id"]

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
