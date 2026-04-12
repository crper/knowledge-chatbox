from __future__ import annotations

from typing import TYPE_CHECKING, Any

import pytest
from sqlalchemy import create_engine, select
from sqlalchemy.orm import Session

from knowledge_chatbox_api.models.auth import User
from knowledge_chatbox_api.models.document import Document, DocumentRevision
from knowledge_chatbox_api.models.space import Space
from knowledge_chatbox_api.schemas.chat import ChatSourceRead
from knowledge_chatbox_api.services.chat.workflow.output import ChatWorkflowResult

if TYPE_CHECKING:
    from fastapi.testclient import TestClient


def login_as_admin(api_client: TestClient) -> None:
    response = api_client.post(
        "/api/auth/login",
        json={"username": "admin", "password": "Admin123456"},
    )

    assert response.status_code == 200


def create_chat_session(api_client: TestClient, title: str = "上下文会话") -> int:
    response = api_client.post("/api/chat/sessions", json={"title": title})

    assert response.status_code == 201
    return response.json()["data"]["id"]


def seed_document_revision(
    sqlite_path,
    *,
    content_hash: str,
    logical_name: str,
    revision_id: int,
    revision_no: int,
    source_filename: str,
) -> dict[str, int]:
    engine = create_engine(f"sqlite:///{sqlite_path}")

    try:
        with Session(engine) as session:
            user = session.scalar(select(User).where(User.username == "admin"))
            assert user is not None
            space = session.scalar(select(Space).where(Space.owner_user_id == user.id))
            assert space is not None

            document = session.scalar(
                select(Document).where(
                    Document.space_id == space.id,
                    Document.logical_name == logical_name,
                )
            )
            if document is None:
                document = Document(
                    id=revision_id,
                    space_id=space.id,
                    title=logical_name,
                    logical_name=logical_name,
                    status="active",
                    current_version_number=revision_no,
                    created_by_user_id=user.id,
                    updated_by_user_id=user.id,
                )
                session.add(document)
                session.flush()
            else:
                document.current_version_number = revision_no

            revision = DocumentRevision(
                id=revision_id,
                document_id=document.id,
                revision_no=revision_no,
                source_filename=source_filename,
                mime_type="application/pdf",
                content_hash=content_hash,
                file_type="pdf",
                ingest_status="indexed",
                source_path=f"/tmp/{source_filename}",
                normalized_path=f"/tmp/{source_filename}.md",
                file_size=128,
                chunk_count=1,
                created_by_user_id=user.id,
                updated_by_user_id=user.id,
            )
            session.add(revision)
            session.flush()
            document.latest_revision_id = revision.id
            session.commit()

            return {"document_id": document.id, "document_revision_id": revision.id}
    finally:
        engine.dispose()


def test_chat_context_api_returns_deduplicated_attachments_and_latest_assistant_sources(
    api_client: TestClient,
    monkeypatch,
    sqlite_path,
) -> None:
    class ContextWorkflowStub:
        def run_sync(self, *, deps, session_id: int, question: str, attachments=None):
            del deps, session_id, attachments
            if question == "第二条消息":
                return ChatWorkflowResult(
                    answer="第二次回答",
                    sources=[  # pyright: ignore[reportArgumentType]
                        {
                            "chunk_id": "doc-2:0",
                            "document_id": 2,
                            "document_name": "新文档",
                            "snippet": "新片段 A",
                        },
                        {
                            "chunk_id": "doc-2:1",
                            "document_id": 2,
                            "document_name": "新文档",
                            "snippet": "新片段 B",
                        },
                    ],
                )

            return ChatWorkflowResult(
                answer="第一次回答",
                sources=[  # pyright: ignore[reportArgumentType]
                    {
                        "chunk_id": "doc-1:0",
                        "document_id": 1,
                        "document_name": "旧文档",
                        "snippet": "旧片段",
                    }
                ],
            )

    monkeypatch.setattr(
        "knowledge_chatbox_api.services.chat.chat_application_service.ChatWorkflow",
        ContextWorkflowStub,
    )

    login_as_admin(api_client)
    session_id = create_chat_session(api_client)
    document_revision_a_v1 = seed_document_revision(
        sqlite_path,
        content_hash="hash-doc-a-v1",
        logical_name="共享文档.pdf",
        revision_id=11,
        revision_no=1,
        source_filename="shared-doc-v1.pdf",
    )
    document_revision_a_v2 = seed_document_revision(
        sqlite_path,
        content_hash="hash-doc-a-v2",
        logical_name="共享文档.pdf",
        revision_id=12,
        revision_no=2,
        source_filename="shared-doc-v2.pdf",
    )
    revision_only = seed_document_revision(
        sqlite_path,
        content_hash="hash-revision-only",
        logical_name="单独修订.pdf",
        revision_id=30,
        revision_no=1,
        source_filename="revision-only.pdf",
    )

    first_message = api_client.post(
        f"/api/chat/sessions/{session_id}/messages",
        json={
            "content": "第一条消息",
            "client_request_id": "req-context-1",
            "attachments": [
                {
                    "attachment_id": "doc-shared-v1",
                    "type": "document",
                    "name": "doc-v1.pdf",
                    "mime_type": "application/pdf",
                    "size_bytes": 128,
                    **document_revision_a_v1,
                },
                {
                    "attachment_id": "rev-shared-v1",
                    "type": "document",
                    "name": "rev-v1.pdf",
                    "mime_type": "application/pdf",
                    "size_bytes": 128,
                    **revision_only,
                },
            ],
        },
    )
    assert first_message.status_code == 200

    second_message = api_client.post(
        f"/api/chat/sessions/{session_id}/messages",
        json={
            "content": "第二条消息",
            "client_request_id": "req-context-2",
            "attachments": [
                {
                    "attachment_id": "doc-shared-v2",
                    "type": "document",
                    "name": "doc-v2.pdf",
                    "mime_type": "application/pdf",
                    "size_bytes": 128,
                    **document_revision_a_v2,
                },
                {
                    "attachment_id": "rev-shared-v2",
                    "type": "document",
                    "name": "rev-v2.pdf",
                    "mime_type": "application/pdf",
                    "size_bytes": 128,
                    **revision_only,
                },
            ],
        },
    )
    assert second_message.status_code == 200

    response = api_client.get(f"/api/chat/sessions/{session_id}/context")
    payload = response.json()

    assert response.status_code == 200
    assert payload["success"] is True
    assert payload["data"]["session_id"] == session_id
    assert payload["data"]["attachment_count"] == 2
    assert {attachment["attachment_id"] for attachment in payload["data"]["attachments"]} == {
        "doc-shared-v2",
        "rev-shared-v2",
    }
    assert payload["data"]["latest_assistant_sources"] == [
        {
            "chunk_id": "doc-2:0",
            "document_id": 2,
            "document_revision_id": None,
            "document_name": "新文档",
            "page_number": None,
            "score": None,
            "section_title": None,
            "snippet": "新片段 A",
        },
        {
            "chunk_id": "doc-2:1",
            "document_id": 2,
            "document_revision_id": None,
            "document_name": "新文档",
            "page_number": None,
            "score": None,
            "section_title": None,
            "snippet": "新片段 B",
        },
    ]


@pytest.mark.integration
@pytest.mark.requires_db
def test_chat_context_latest_assistant_sources_conform_to_chat_source_read_schema(
    api_client: TestClient,
    monkeypatch,
) -> None:
    """测试 context 接口返回的 latest_assistant_sources 符合 ChatSourceRead 结构定义"""

    class SourceSchemaWorkflowStub:
        def run_sync(self, *, deps, session_id: int, question: str, attachments=None):
            del deps, session_id, question, attachments
            return ChatWorkflowResult(
                answer="测试回答",
                sources=[  # pyright: ignore[reportArgumentType]
                    {
                        "chunk_id": "test-chunk-1",
                        "document_id": 42,
                        "document_revision_id": 100,
                        "document_name": "测试文档.pdf",
                        "page_number": 5,
                        "score": 0.95,
                        "section_title": "测试章节",
                        "snippet": "测试片段内容",
                    }
                ],
            )

    monkeypatch.setattr(
        "knowledge_chatbox_api.services.chat.chat_application_service.ChatWorkflow",
        SourceSchemaWorkflowStub,
    )
    from tests.fixtures.helpers import create_chat_session, login_as_admin

    login_as_admin(api_client)
    session_id = create_chat_session(api_client)

    api_client.post(
        f"/api/chat/sessions/{session_id}/messages",
        json={
            "content": "测试消息",
            "client_request_id": "req-context-schema-1",
        },
    )

    response = api_client.get(f"/api/chat/sessions/{session_id}/context")
    payload = response.json()

    assert response.status_code == 200
    assert payload["success"] is True

    sources = payload["data"]["latest_assistant_sources"]
    assert isinstance(sources, list)
    assert len(sources) == 1

    source: dict[str, Any] = sources[0]
    validated = ChatSourceRead.model_validate(source)
    assert validated.chunk_id == "test-chunk-1"
    assert validated.document_id == 42
    assert validated.document_revision_id == 100
    assert validated.document_name == "测试文档.pdf"
    assert validated.page_number == 5
    assert validated.score == 0.95
    assert validated.section_title == "测试章节"
    assert validated.snippet == "测试片段内容"
