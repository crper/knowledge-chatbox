from __future__ import annotations

import json
from typing import TYPE_CHECKING, Any

from pydantic_ai.messages import PartDeltaEvent, PartStartEvent, TextPart, TextPartDelta
from tests.fixtures.helpers import create_chat_session, login_as_admin, upload_text_document
from tests.fixtures.stubs import (
    EmbeddingAdapterStub,
    TextResponseAdapterStub,
    make_adapter_backed_chat_workflow_class,
    patch_document_index_embedding,
)

if TYPE_CHECKING:
    from collections.abc import AsyncIterator

    from fastapi.testclient import TestClient


def stub_document_index_embedding(monkeypatch) -> None:
    patch_document_index_embedding(
        monkeypatch,
        adapter=EmbeddingAdapterStub(vector_size=384),
    )


def read_session_messages(api_client: TestClient, session_id: int) -> list[dict[str, Any]]:
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


def pick_user_and_assistant(
    messages: list[dict[str, Any]],
) -> tuple[dict[str, Any], dict[str, Any]]:
    assert len(messages) == 2
    user_message = next(message for message in messages if message["role"] == "user")
    assistant_message = next(message for message in messages if message["role"] == "assistant")
    return user_message, assistant_message


def comparable_message_fields(message: dict[str, Any]) -> dict[str, Any]:
    sources: list[dict[str, Any]] = [
        {
            "chunk_id": source.get("chunk_id"),
            "document_id": source.get("document_id"),
            "document_revision_id": source.get("document_revision_id"),
            "document_name": source.get("document_name"),
            "page_number": source.get("page_number"),
            "score": source.get("score"),
            "section_title": source.get("section_title"),
            "snippet": source.get("snippet"),
        }
        for source in message["sources"] or []
    ]
    return {
        "attachments": message["attachments"],
        "content": message["content"],
        "error_message": message["error_message"],
        "role": message["role"],
        "sources": sources,
        "status": message["status"],
    }


def test_sync_and_stream_chat_produce_equivalent_successful_messages_and_sources(
    api_client: TestClient,
    configure_upload_provider,
    monkeypatch,
) -> None:
    del configure_upload_provider
    stub_document_index_embedding(monkeypatch)
    workflow_cls = make_adapter_backed_chat_workflow_class(
        response_adapter=TextResponseAdapterStub(
            sync_answer="统一回答",
            stream_chunks=["统一", "回答"],
        ),
        sync_answer="统一回答",
        sync_sources=[
            {
                "chunk_id": "doc-1:0",
                "document_id": 1,
                "document_name": "guide.txt",
                "snippet": "统一来源",
            }
        ],
        stream_sources=[
            {
                "chunk_id": "doc-1:0",
                "document_id": 1,
                "document_name": "guide.txt",
                "snippet": "统一来源",
            }
        ],
    )
    monkeypatch.setattr(
        "knowledge_chatbox_api.services.chat.chat_application_service.ChatWorkflow",
        workflow_cls,
    )
    monkeypatch.setattr(
        "knowledge_chatbox_api.services.chat.chat_run_service.ChatWorkflow",
        workflow_cls,
    )

    login_as_admin(api_client)
    upload_text_document(
        api_client,
        filename="guide.txt",
        content=(b"OpenAI provider setup guide.\nUse the API key and base URL for setup."),
    )

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
    assert sync_assistant_message["sources"]


def test_sync_and_stream_chat_produce_equivalent_failure_messages(
    api_client: TestClient,
    monkeypatch,
) -> None:
    stub_document_index_embedding(monkeypatch)

    class FailingChatWorkflow:
        def run_sync(self, *, deps, session_id: int, question: str, attachments=None):
            del deps, session_id, question, attachments
            raise RuntimeError("provider backend unavailable")

        def run_stream_events(
            self,
            *,
            deps,
            session_id: int,
            question: str,
            attachments=None,
        ) -> AsyncIterator[object]:
            del deps, session_id, question, attachments

            async def _events():
                yield PartStartEvent(index=0, part=TextPart(""))
                yield PartDeltaEvent(index=0, delta=TextPartDelta(""))
                raise RuntimeError("provider backend unavailable")

            return _events()

    monkeypatch.setattr(
        "knowledge_chatbox_api.services.chat.chat_application_service.ChatWorkflow",
        FailingChatWorkflow,
    )
    monkeypatch.setattr(
        "knowledge_chatbox_api.services.chat.chat_run_service.ChatWorkflow",
        FailingChatWorkflow,
    )

    login_as_admin(api_client)
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
