from __future__ import annotations

from typing import Any

from pydantic import BaseModel
from tests.fixtures.helpers import (
    build_png_bytes,
    create_logged_in_chat_session,
    login_with_credentials,
    upload_document_file,
    upload_image_document,
    upload_text_document,
)


class FakeResponse(BaseModel):
    status_code: int
    payload: dict[str, Any]

    def json(self) -> dict[str, Any]:
        return self.payload


class FakeClient:
    def __init__(self, responses: list[FakeResponse]) -> None:
        self._responses = list(responses)
        self.calls: list[tuple[str, str, dict]] = []

    def post(self, path: str, **kwargs):
        self.calls.append(("post", path, kwargs))
        assert self._responses, "no fake response queued"
        return self._responses.pop(0)


def test_login_with_credentials_posts_login_payload_and_returns_data() -> None:
    client = FakeClient(
        [
            FakeResponse(
                status_code=200,
                payload={"data": {"access_token": "token-1"}},
            )
        ]
    )

    data = login_with_credentials(client, username="alice", password="secret-123")

    assert data == {"access_token": "token-1"}
    assert client.calls == [
        (
            "post",
            "/api/auth/login",
            {"json": {"username": "alice", "password": "secret-123"}},
        )
    ]


def test_create_logged_in_chat_session_logs_in_then_creates_session() -> None:
    client = FakeClient(
        [
            FakeResponse(status_code=200, payload={"data": {"access_token": "token-1"}}),
            FakeResponse(status_code=201, payload={"data": {"id": 42}}),
        ]
    )

    session_id = create_logged_in_chat_session(
        client,
        title="集成测试会话",
        username="alice",
        password="secret-123",
    )

    assert session_id == 42
    assert client.calls == [
        (
            "post",
            "/api/auth/login",
            {"json": {"username": "alice", "password": "secret-123"}},
        ),
        (
            "post",
            "/api/chat/sessions",
            {"json": {"title": "集成测试会话"}},
        ),
    ]


def test_upload_document_file_posts_expected_files_payload() -> None:
    client = FakeClient(
        [
            FakeResponse(
                status_code=201,
                payload={"data": {"revision": {"id": 7}}},
            )
        ]
    )

    payload = upload_document_file(
        client,
        filename="note.txt",
        content=b"hello",
        content_type="text/plain",
    )

    assert payload == {"revision": {"id": 7}}
    assert client.calls == [
        (
            "post",
            "/api/documents/upload",
            {"files": {"file": ("note.txt", b"hello", "text/plain")}},
        )
    ]


def test_upload_text_document_uses_text_defaults() -> None:
    client = FakeClient(
        [
            FakeResponse(
                status_code=201,
                payload={"data": {"revision": {"id": 8}}},
            )
        ]
    )

    payload = upload_text_document(client)

    assert payload == {"revision": {"id": 8}}
    assert client.calls == [
        (
            "post",
            "/api/documents/upload",
            {"files": {"file": ("note.txt", b"hello world", "text/plain")}},
        )
    ]


def test_upload_image_document_uses_png_defaults() -> None:
    client = FakeClient(
        [
            FakeResponse(
                status_code=202,
                payload={"data": {"revision": {"id": 9}}},
            )
        ]
    )

    payload = upload_image_document(client)

    assert payload == {"revision": {"id": 9}}
    upload_call = client.calls[0]
    assert upload_call[0] == "post"
    assert upload_call[1] == "/api/documents/upload"
    filename, content, content_type = upload_call[2]["files"]["file"]
    assert filename == "image.png"
    assert content_type == "image/png"
    assert content == build_png_bytes()
