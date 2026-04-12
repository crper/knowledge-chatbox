from __future__ import annotations

import asyncio
import json
import time
from io import BytesIO
from threading import Event, Thread
from typing import TYPE_CHECKING, Any, cast

from PIL import Image
from pydantic_ai.messages import (
    FinalResultEvent,
    PartDeltaEvent,
    PartStartEvent,
    TextPart,
    TextPartDelta,
)
from tests.fixtures.stubs import make_adapter_backed_chat_workflow_class

from knowledge_chatbox_api.repositories.chat_run_repository import ChatRunRepository

if TYPE_CHECKING:
    from fastapi.testclient import TestClient


class StreamingResponseAdapterStub:
    def __init__(self) -> None:
        self.last_messages = None
        self.stream_calls = 0

    def stream_response(self, messages: list[dict[str, str]], settings):
        del settings
        self.last_messages = messages
        self.stream_calls += 1
        yield {"type": "text_delta", "delta": "hello "}
        yield {"type": "text_delta", "delta": "world"}
        yield {"type": "completed", "usage": {"output_tokens": 2}}


class EmbeddingAdapterStub:
    def embed(self, texts: list[str], settings) -> list[list[float]]:
        del texts, settings
        return [[0.1] * 384]


class BlockingStreamingResponseAdapter:
    def __init__(self, started: Event, release: Event) -> None:
        self.started = started
        self.release = release

    def stream_response(self, messages: list[dict[str, str]], settings):
        del messages, settings
        self.started.set()
        yield {"type": "text_delta", "delta": "hello"}
        assert self.release.wait(timeout=10), "stream release timed out"
        yield {"type": "completed", "usage": {"output_tokens": 1}}


class HoldingWriteLockStreamingResponseAdapter:
    def __init__(self, started: Event, release: Event) -> None:
        self.started = started
        self.release = release

    def stream_response(self, messages: list[dict[str, str]], settings):
        del messages, settings
        for index in range(8):
            yield {"type": "text_delta", "delta": f"chunk-{index}"}
        self.started.set()
        assert self.release.wait(timeout=10), "stream release timed out"
        yield {"type": "completed", "usage": {"output_tokens": 8}}


class CancellableChatWorkflow:
    started = Event()
    cancelled = Event()

    def run_sync(self, *, deps, session_id: int, question: str, attachments=None):
        del deps, session_id, question, attachments
        raise NotImplementedError

    def run_stream_events(
        self,
        *,
        deps,
        session_id: int,
        question: str,
        attachments=None,
    ):
        del deps, session_id, question, attachments

        async def _events():
            yield PartStartEvent(index=0, part=TextPart(""))
            yield FinalResultEvent(tool_name=None, tool_call_id=None)
            yield PartDeltaEvent(index=0, delta=TextPartDelta("hello"))
            self.started.set()
            try:
                while True:
                    await asyncio.sleep(10)
            except asyncio.CancelledError:
                self.cancelled.set()
                raise

        return _events()


def create_png_bytes() -> bytes:
    buffer = BytesIO()
    Image.new("RGB", (8, 8), color="white").save(buffer, format="PNG")
    return buffer.getvalue()


def _extract_run_id_from_stream(body: str) -> int:
    current_event: str | None = None
    for line in body.splitlines():
        if line.startswith("event: "):
            current_event = line.removeprefix("event: ").strip()
            continue
        if current_event == "run.started" and line.startswith("data: "):
            payload = json.loads(line.removeprefix("data: ").strip())
            return payload["run_id"]
    raise AssertionError("run.started event not found")


def test_chat_stream_api_emits_runtime_events_and_persists_messages(
    api_client: TestClient,
    mock_pydanticai_chat_workflow,
) -> None:
    del mock_pydanticai_chat_workflow

    api_client.post("/api/auth/login", json={"username": "admin", "password": "Admin123456"})
    session_response = api_client.post("/api/chat/sessions", json={"title": "Stream Session"})
    session_id = session_response.json()["data"]["id"]

    with api_client.stream(
        "POST",
        f"/api/chat/sessions/{session_id}/messages/stream",
        json={"content": "question", "client_request_id": "req-stream-api-1"},
    ) as response:
        stream_body = response.read().decode()

    run_id = _extract_run_id_from_stream(stream_body)
    messages_response = api_client.get(f"/api/chat/sessions/{session_id}/messages")
    run_response = api_client.get(f"/api/chat/runs/{run_id}")
    events_response = api_client.get(f"/api/chat/runs/{run_id}/events")

    assert response.status_code == 200
    assert response.headers["content-type"].startswith("text/event-stream")
    assert "event: run.started" in stream_body
    assert "event: message.started" in stream_body
    assert "event: part.text.delta" in stream_body
    assert "event: message.completed" in stream_body
    assert "event: run.completed" in stream_body
    assert messages_response.status_code == 200
    assert messages_response.json()["data"][-1]["content"] == "hello world"
    assert run_response.status_code == 200
    assert run_response.json()["data"]["status"] == "succeeded"
    assert events_response.status_code == 200
    assert events_response.json()["data"][-1]["event_type"] == "run.completed"


def test_chat_stream_api_replays_existing_run_for_duplicate_client_request_id(
    api_client: TestClient,
    monkeypatch,
) -> None:
    adapter = StreamingResponseAdapterStub()
    workflow_cls = make_adapter_backed_chat_workflow_class(response_adapter=adapter)
    monkeypatch.setattr(
        "knowledge_chatbox_api.services.chat.chat_application_service.ChatWorkflow",
        workflow_cls,
    )
    monkeypatch.setattr(
        "knowledge_chatbox_api.services.chat.chat_run_service.ChatWorkflow",
        workflow_cls,
    )

    api_client.post("/api/auth/login", json={"username": "admin", "password": "Admin123456"})
    session_response = api_client.post("/api/chat/sessions", json={"title": "Idempotent Session"})
    session_id = session_response.json()["data"]["id"]

    with api_client.stream(
        "POST",
        f"/api/chat/sessions/{session_id}/messages/stream",
        json={"content": "question", "client_request_id": "req-stream-idempotent-1"},
    ) as response:
        first_body = response.read().decode()

    with api_client.stream(
        "POST",
        f"/api/chat/sessions/{session_id}/messages/stream",
        json={"content": "question", "client_request_id": "req-stream-idempotent-1"},
    ) as response:
        second_body = response.read().decode()

    first_run_id = _extract_run_id_from_stream(first_body)
    second_run_id = _extract_run_id_from_stream(second_body)
    messages_response = api_client.get(f"/api/chat/sessions/{session_id}/messages")
    events_response = api_client.get(f"/api/chat/runs/{first_run_id}/events")
    message_roles = [message["role"] for message in messages_response.json()["data"]]

    assert first_run_id == second_run_id
    assert adapter.stream_calls == 1
    assert messages_response.status_code == 200
    assert message_roles == ["user", "assistant"]
    assert events_response.status_code == 200
    assert [event["event_type"] for event in events_response.json()["data"]] == [
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


def test_chat_stream_api_cancels_active_run_when_requested(
    api_client: TestClient,
    monkeypatch,
) -> None:
    CancellableChatWorkflow.started = Event()
    CancellableChatWorkflow.cancelled = Event()
    monkeypatch.setattr(
        "knowledge_chatbox_api.services.chat.chat_application_service.ChatWorkflow",
        CancellableChatWorkflow,
    )
    monkeypatch.setattr(
        "knowledge_chatbox_api.services.chat.chat_run_service.ChatWorkflow",
        CancellableChatWorkflow,
    )

    api_client.post("/api/auth/login", json={"username": "admin", "password": "Admin123456"})
    session_response = api_client.post("/api/chat/sessions", json={"title": "Cancelable Session"})
    session_id = session_response.json()["data"]["id"]
    stream_body: dict[str, str] = {}

    def consume_stream() -> None:
        with api_client.stream(
            "POST",
            f"/api/chat/sessions/{session_id}/messages/stream",
            json={"content": "question", "client_request_id": "req-stream-cancel-1"},
        ) as response:
            stream_body["value"] = response.read().decode()

    stream_thread = Thread(target=consume_stream)
    stream_thread.start()

    assert CancellableChatWorkflow.started.wait(timeout=3), "stream never emitted first delta"

    active_runs_response = api_client.get("/api/chat/runs/active")
    active_runs = active_runs_response.json()["data"]
    assert len(active_runs) == 1
    run_id = active_runs[0]["id"]

    cancel_response = api_client.post(f"/api/chat/runs/{run_id}/cancel")

    stream_thread.join(timeout=5)
    assert CancellableChatWorkflow.cancelled.wait(timeout=3), "workflow was not cancelled"

    messages_response = api_client.get(f"/api/chat/sessions/{session_id}/messages")
    run_response = api_client.get(f"/api/chat/runs/{run_id}")

    assert cancel_response.status_code == 200
    assert cancel_response.json()["data"] == {"cancelled": True}
    assert "event: run.failed" in stream_body["value"]
    assert "已停止生成。你可以继续提问，或重新发送。" in stream_body["value"]
    assert run_response.status_code == 200
    assert run_response.json()["data"]["status"] == "cancelled"
    assert messages_response.status_code == 200
    assert messages_response.json()["data"][-1]["status"] == "failed"
    assert (
        messages_response.json()["data"][-1]["error_message"]
        == "已停止生成。你可以继续提问，或重新发送。"
    )


def test_chat_stream_api_cancels_pending_run_by_client_request_id(
    api_client: TestClient,
    monkeypatch,
) -> None:
    CancellableChatWorkflow.started = Event()
    CancellableChatWorkflow.cancelled = Event()
    monkeypatch.setattr(
        "knowledge_chatbox_api.services.chat.chat_application_service.ChatWorkflow",
        CancellableChatWorkflow,
    )
    monkeypatch.setattr(
        "knowledge_chatbox_api.services.chat.chat_run_service.ChatWorkflow",
        CancellableChatWorkflow,
    )

    api_client.post("/api/auth/login", json={"username": "admin", "password": "Admin123456"})
    session_response = api_client.post("/api/chat/sessions", json={"title": "Cancelable Session"})
    session_id = session_response.json()["data"]["id"]
    client_request_id = "req-stream-cancel-before-start-1"
    stream_body: dict[str, str] = {}

    def consume_stream() -> None:
        with api_client.stream(
            "POST",
            f"/api/chat/sessions/{session_id}/messages/stream",
            json={"content": "question", "client_request_id": client_request_id},
        ) as response:
            stream_body["value"] = response.read().decode()

    stream_thread = Thread(target=consume_stream)
    stream_thread.start()

    cancel_response = api_client.post(
        f"/api/chat/sessions/{session_id}/messages/stream/cancel",
        json={"client_request_id": client_request_id},
    )

    stream_thread.join(timeout=5)
    active_runs_response = api_client.get("/api/chat/runs/active")
    messages_response = api_client.get(f"/api/chat/sessions/{session_id}/messages")

    assert cancel_response.status_code == 200
    assert cancel_response.json()["data"] == {"cancelled": True}
    assert not stream_thread.is_alive()
    assert active_runs_response.json()["data"] == []
    if stream_body.get("value"):
        assert CancellableChatWorkflow.cancelled.wait(timeout=3), "workflow was not cancelled"
        assert "event: run.failed" in stream_body["value"]
        assert "已停止生成。你可以继续提问，或重新发送。" in stream_body["value"]
        assert messages_response.json()["data"][-1]["status"] == "failed"
        assert (
            messages_response.json()["data"][-1]["error_message"]
            == "已停止生成。你可以继续提问，或重新发送。"
        )
    else:
        assert messages_response.json()["data"] == []


def test_chat_stream_api_cancels_pending_run_even_when_run_creation_is_slow(
    api_client: TestClient,
    monkeypatch,
) -> None:
    CancellableChatWorkflow.started = Event()
    CancellableChatWorkflow.cancelled = Event()
    monkeypatch.setattr(
        "knowledge_chatbox_api.services.chat.chat_application_service.ChatWorkflow",
        CancellableChatWorkflow,
    )
    monkeypatch.setattr(
        "knowledge_chatbox_api.services.chat.chat_run_service.ChatWorkflow",
        CancellableChatWorkflow,
    )

    original_create_run = ChatRunRepository.create_run

    def delayed_create_run(self, *args, **kwargs):
        time.sleep(0.7)
        return original_create_run(self, *args, **kwargs)

    monkeypatch.setattr(ChatRunRepository, "create_run", delayed_create_run)

    api_client.post("/api/auth/login", json={"username": "admin", "password": "Admin123456"})
    session_response = api_client.post("/api/chat/sessions", json={"title": "Cancelable Session"})
    session_id = session_response.json()["data"]["id"]
    client_request_id = "req-stream-cancel-slow-run-1"
    stream_body: dict[str, str] = {}

    def consume_stream() -> None:
        with api_client.stream(
            "POST",
            f"/api/chat/sessions/{session_id}/messages/stream",
            json={"content": "question", "client_request_id": client_request_id},
        ) as response:
            stream_body["value"] = response.read().decode()

    stream_thread = Thread(target=consume_stream)
    stream_thread.start()

    time.sleep(0.05)
    cancel_response = api_client.post(
        f"/api/chat/sessions/{session_id}/messages/stream/cancel",
        json={"client_request_id": client_request_id},
    )

    stream_thread.join(timeout=5)
    active_runs_response = api_client.get("/api/chat/runs/active")
    messages_response = api_client.get(f"/api/chat/sessions/{session_id}/messages")

    assert cancel_response.status_code == 200
    assert cancel_response.json()["data"] == {"cancelled": True}
    assert not stream_thread.is_alive()
    assert active_runs_response.json()["data"] == []
    assert messages_response.json()["data"] == []
    assert stream_body.get("value", "") == ""


def test_chat_profile_api_exposes_response_route_to_authenticated_users(
    api_client: TestClient,
) -> None:
    api_client.post("/api/auth/login", json={"username": "admin", "password": "Admin123456"})
    api_client.post(
        "/api/users",
        json={"username": "alice", "password": "secret-123", "role": "user"},
    )
    api_client.post("/api/auth/logout")
    api_client.post("/api/auth/login", json={"username": "alice", "password": "secret-123"})

    response = api_client.get("/api/chat/profile")

    assert response.status_code == 200
    assert response.json()["data"] == {
        "provider": "ollama",
        "model": "qwen3.5:4b",
        "configured": True,
    }


def test_chat_stream_api_passes_unified_image_attachments_to_provider(
    api_client: TestClient,
    configure_upload_provider,
    monkeypatch,
) -> None:
    del configure_upload_provider
    adapter = StreamingResponseAdapterStub()
    workflow_cls = make_adapter_backed_chat_workflow_class(response_adapter=adapter)
    monkeypatch.setattr(
        "knowledge_chatbox_api.services.chat.chat_application_service.ChatWorkflow",
        workflow_cls,
    )
    monkeypatch.setattr(
        "knowledge_chatbox_api.services.chat.chat_run_service.ChatWorkflow",
        workflow_cls,
    )

    api_client.post("/api/auth/login", json={"username": "admin", "password": "Admin123456"})
    session_response = api_client.post("/api/chat/sessions", json={"title": "Stream Session"})
    session_id = session_response.json()["data"]["id"]
    upload_response = api_client.post(
        "/api/documents/upload",
        files={"file": ("image.png", create_png_bytes(), "image/png")},
    )
    uploaded_attachment = upload_response.json()["data"]

    with api_client.stream(
        "POST",
        f"/api/chat/sessions/{session_id}/messages/stream",
        json={
            "content": "question",
            "client_request_id": "req-stream-api-image-1",
            "attachments": [
                {
                    "attachment_id": "att-1",
                    "type": "image",
                    "name": "image.png",
                    "mime_type": "image/png",
                    "size_bytes": 5,
                    "document_revision_id": uploaded_attachment["revision"]["id"],
                }
            ],
        },
    ) as response:
        response.read()

    assert response.status_code == 200
    assert adapter.last_messages is not None
    user_message = adapter.last_messages[-1]
    assert isinstance(user_message["content"], list)
    content = cast("list[dict[str, Any]]", user_message["content"])
    assert content[0]["type"] == "text"
    assert content[1]["type"] == "image"
    assert content[1]["mime_type"] == "image/jpeg"
    assert isinstance(content[1]["data_base64"], str)
    assert content[1]["data_base64"].strip() != ""


def test_settings_api_stays_available_while_chat_stream_is_open(
    api_client: TestClient,
    monkeypatch,
) -> None:
    started = Event()
    release = Event()
    workflow_cls = make_adapter_backed_chat_workflow_class(
        response_adapter=BlockingStreamingResponseAdapter(started, release)
    )
    monkeypatch.setattr(
        "knowledge_chatbox_api.services.chat.chat_application_service.ChatWorkflow",
        workflow_cls,
    )
    monkeypatch.setattr(
        "knowledge_chatbox_api.services.chat.chat_run_service.ChatWorkflow",
        workflow_cls,
    )

    api_client.post("/api/auth/login", json={"username": "admin", "password": "Admin123456"})
    session_response = api_client.post("/api/chat/sessions", json={"title": "Stream Session"})
    session_id = session_response.json()["data"]["id"]
    stream_status_code: dict[str, int] = {}

    def consume_stream() -> None:
        with api_client.stream(
            "POST",
            f"/api/chat/sessions/{session_id}/messages/stream",
            json={"content": "question", "client_request_id": "req-stream-api-lock-1"},
        ) as response:
            stream_status_code["value"] = response.status_code
            response.read()

    stream_thread = Thread(target=consume_stream)
    stream_thread.start()
    assert started.wait(timeout=3), "stream never reached the first delta"

    settings_response = api_client.get("/api/settings")

    release.set()
    stream_thread.join(timeout=5)

    assert settings_response.status_code == 200
    assert stream_status_code["value"] == 200


def test_chat_session_rename_stays_available_while_chat_stream_is_open(
    api_client: TestClient,
    monkeypatch,
) -> None:
    started = Event()
    release = Event()
    workflow_cls = make_adapter_backed_chat_workflow_class(
        response_adapter=HoldingWriteLockStreamingResponseAdapter(started, release)
    )
    monkeypatch.setattr(
        "knowledge_chatbox_api.services.chat.chat_application_service.ChatWorkflow",
        workflow_cls,
    )
    monkeypatch.setattr(
        "knowledge_chatbox_api.services.chat.chat_run_service.ChatWorkflow",
        workflow_cls,
    )

    api_client.post("/api/auth/login", json={"username": "admin", "password": "Admin123456"})
    session_response = api_client.post("/api/chat/sessions", json={"title": "Rename Session"})
    session_id = session_response.json()["data"]["id"]
    stream_status_code: dict[str, int] = {}
    rename_status_code: dict[str, int] = {}
    rename_finished = Event()

    def consume_stream() -> None:
        with api_client.stream(
            "POST",
            f"/api/chat/sessions/{session_id}/messages/stream",
            json={"content": "question", "client_request_id": "req-stream-session-rename-1"},
        ) as response:
            stream_status_code["value"] = response.status_code
            response.read()

    def rename_session() -> None:
        response = api_client.patch(
            f"/api/chat/sessions/{session_id}",
            json={"title": "Renamed during stream"},
        )
        rename_status_code["value"] = response.status_code
        rename_finished.set()

    stream_thread = Thread(target=consume_stream)
    rename_thread = Thread(target=rename_session)
    stream_thread.start()
    assert started.wait(timeout=3), "stream never reached the holding state"

    try:
        rename_thread.start()
        assert rename_finished.wait(timeout=1), "session rename stayed blocked while stream open"
    finally:
        release.set()
        rename_thread.join(timeout=5)
        stream_thread.join(timeout=5)

    assert rename_status_code["value"] == 200
    assert stream_status_code["value"] == 200


def test_chat_session_creation_stays_available_while_chat_stream_is_open(
    api_client: TestClient,
    monkeypatch,
) -> None:
    started = Event()
    release = Event()
    workflow_cls = make_adapter_backed_chat_workflow_class(
        response_adapter=HoldingWriteLockStreamingResponseAdapter(started, release)
    )
    monkeypatch.setattr(
        "knowledge_chatbox_api.services.chat.chat_application_service.ChatWorkflow",
        workflow_cls,
    )
    monkeypatch.setattr(
        "knowledge_chatbox_api.services.chat.chat_run_service.ChatWorkflow",
        workflow_cls,
    )

    api_client.post("/api/auth/login", json={"username": "admin", "password": "Admin123456"})
    session_response = api_client.post("/api/chat/sessions", json={"title": "Origin Session"})
    session_id = session_response.json()["data"]["id"]
    stream_status_code: dict[str, int] = {}
    create_status_code: dict[str, int] = {}
    create_finished = Event()

    def consume_stream() -> None:
        with api_client.stream(
            "POST",
            f"/api/chat/sessions/{session_id}/messages/stream",
            json={"content": "question", "client_request_id": "req-stream-session-create-1"},
        ) as response:
            stream_status_code["value"] = response.status_code
            response.read()

    def create_session() -> None:
        response = api_client.post("/api/chat/sessions", json={"title": "Created during stream"})
        create_status_code["value"] = response.status_code
        create_finished.set()

    stream_thread = Thread(target=consume_stream)
    create_thread = Thread(target=create_session)
    stream_thread.start()
    assert started.wait(timeout=3), "stream never reached the holding state"

    try:
        create_thread.start()
        assert create_finished.wait(timeout=1), "session creation stayed blocked while stream open"
    finally:
        release.set()
        create_thread.join(timeout=5)
        stream_thread.join(timeout=5)

    assert create_status_code["value"] == 201
    assert stream_status_code["value"] == 200
