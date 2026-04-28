from __future__ import annotations

from typing import TYPE_CHECKING
from unittest.mock import ANY

from knowledge_chatbox_api.core.config import get_settings
from knowledge_chatbox_api.db.session import create_session_factory
from knowledge_chatbox_api.services.documents.ingestion_service import (
    IngestionMetrics,
    IngestionService,
)
from tests.fixtures.helpers import (
    create_logged_in_chat_session,
    login_as_admin,
    upload_image_document,
    upload_text_document,
)
from tests.fixtures.stubs import (
    EmbeddingAdapterStub,
    TextResponseAdapterStub,
    make_adapter_backed_chat_workflow_class,
    patch_document_index_embedding,
)

if TYPE_CHECKING:
    from fastapi.testclient import TestClient


class LoggerSpy:
    def __init__(
        self,
        records: list[dict] | None = None,
        bound_context: dict | None = None,
    ) -> None:
        self.records = records if records is not None else []
        self.bound_context = bound_context if bound_context is not None else {}

    def bind(self, **kwargs):
        return LoggerSpy(self.records, {**self.bound_context, **kwargs})

    def info(self, event: str, **kwargs) -> None:
        self.records.append({"event": event, "level": "info", **self.bound_context, **kwargs})

    def warning(self, event: str, **kwargs) -> None:
        self.records.append({"event": event, "level": "warning", **self.bound_context, **kwargs})

    def exception(self, event: str, **kwargs) -> None:
        self.records.append({"event": event, "level": "exception", **self.bound_context, **kwargs})


def stub_document_index_embedding(monkeypatch) -> None:
    patch_document_index_embedding(
        monkeypatch,
        adapter=EmbeddingAdapterStub(vector_size=384),
    )


def test_stream_chat_logs_run_lifecycle(
    api_client: TestClient,
    monkeypatch,
) -> None:
    run_logger = LoggerSpy()
    workflow_cls = make_adapter_backed_chat_workflow_class(
        response_adapter=TextResponseAdapterStub(
            sync_answer="统一回答",
            stream_chunks=["统一", "回答"],
        ),
    )
    monkeypatch.setattr(
        "knowledge_chatbox_api.services.chat.chat_application_service.ChatWorkflow",
        workflow_cls,
    )
    monkeypatch.setattr(
        "knowledge_chatbox_api.services.chat.chat_run_service.ChatWorkflow",
        workflow_cls,
    )
    monkeypatch.setattr("knowledge_chatbox_api.services.chat.chat_run_service.logger", run_logger)
    monkeypatch.setattr(
        "knowledge_chatbox_api.services.chat.workflow_stream_runner.logger",
        run_logger,
    )

    session_id = create_logged_in_chat_session(api_client, title="stream log session")

    with api_client.stream(
        "POST",
        f"/api/chat/sessions/{session_id}/messages/stream",
        json={
            "content": "How do I set up OpenAI?",
            "client_request_id": "req-chat-log-stream-1",
        },
    ) as response:
        response.read()

    assert response.status_code == 200
    assert run_logger.records == [
        {
            "event": "chat_stream_run_started",
            "level": "info",
            "attachment_count": 0,
            "response_model": "qwen3.5:4b",
            "response_provider": "ollama",
            "run_id": 1,
            "session_id": session_id,
            "operation_kind": "chat_stream",
        },
        {
            "event": "chat_stream_run_completed",
            "level": "info",
            "assistant_message_id": 2,
            "response_model": "qwen3.5:4b",
            "response_provider": "ollama",
            "run_id": 1,
            "session_id": session_id,
            "source_count": 0,
            "operation_kind": "chat_stream",
        },
    ]


def test_sync_chat_logs_failure_summary(
    api_client: TestClient,
    monkeypatch,
) -> None:
    sync_logger = LoggerSpy()

    class FailingChatWorkflow:
        def run_sync(self, *, deps, session_id: int, question: str, attachments=None):
            del deps, session_id, question, attachments
            raise RuntimeError("provider backend unavailable")

    monkeypatch.setattr(
        "knowledge_chatbox_api.services.chat.chat_application_service.ChatWorkflow",
        FailingChatWorkflow,
    )
    monkeypatch.setattr(
        "knowledge_chatbox_api.services.chat.chat_application_service.logger",
        sync_logger,
    )

    login_as_admin(api_client)
    session_response = api_client.post(
        "/api/chat/sessions",
        json={"title": "sync failure log session"},
    )
    session_id = session_response.json()["data"]["id"]

    response = api_client.post(
        f"/api/chat/sessions/{session_id}/messages",
        json={
            "content": "Please fail",
            "client_request_id": "req-chat-log-sync-failure-1",
        },
    )

    assert response.status_code == 200
    assert sync_logger.records == [
        {
            "event": "chat_sync_message_failed",
            "level": "exception",
            "failure_type": "chat_answer_error",
            "response_model": "qwen3.5:4b",
            "response_provider": "ollama",
            "session_id": session_id,
            "operation_kind": "chat_sync",
        }
    ]


def test_document_upload_logs_completed_sync_ingestion(
    api_client: TestClient,
    configure_upload_provider,
    monkeypatch,
) -> None:
    del configure_upload_provider
    ingestion_logger = LoggerSpy()
    stub_document_index_embedding(monkeypatch)
    monkeypatch.setattr(
        "knowledge_chatbox_api.services.documents.ingestion_service.logger",
        ingestion_logger,
    )

    login_as_admin(api_client)
    payload = upload_text_document(api_client)
    assert ingestion_logger.records == [
        {
            "event": "document_upload_completed",
            "level": "info",
            "background_processing": False,
            "deduplicated": False,
            "chunk_count": payload["revision"]["chunk_count"],
            "document_id": payload["document"]["id"],
            "document_revision_id": payload["revision"]["id"],
            "file_type": "txt",
            "file_size_bytes": payload["revision"]["file_size"],
            "filename": "note.txt",
            "index_latency_ms": ANY,
            "normalize_latency_ms": ANY,
            "operation_kind": "document_upload",
        }
    ]


def test_document_background_ingestion_logs_structured_failure(
    api_client: TestClient,
    configure_upload_provider,
    monkeypatch,
) -> None:
    del configure_upload_provider
    ingestion_logger = LoggerSpy()
    monkeypatch.setattr(
        "knowledge_chatbox_api.services.documents.ingestion_service.logger",
        ingestion_logger,
    )
    monkeypatch.setattr(
        "knowledge_chatbox_api.tasks.document_jobs.complete_document_ingestion",
        lambda *_args: True,
    )

    login_as_admin(api_client)
    image_payload = upload_image_document(
        api_client,
        content=b"\x89PNG\r\n\x1a\n",
    )
    revision_id = image_payload["revision"]["id"]

    def _explode_normalize(self, origin_path: str, file_type: str, *, use_vision: bool = True):
        del self, origin_path, file_type, use_vision
        raise RuntimeError("vision exploded")

    monkeypatch.setattr(IngestionService, "_normalize_document", _explode_normalize)

    session_factory = create_session_factory()
    with session_factory() as session:
        revision = IngestionService(session, get_settings()).complete_document_ingestion(
            revision_id
        )
        assert revision.ingest_status == "failed"

    assert ingestion_logger.records[-1] == {
        "event": "document_background_ingestion_failed",
        "level": "exception",
        "document_revision_id": revision_id,
        "exception_type": "RuntimeError",
        "failure_stage": "background_ingestion",
        "file_type": "png",
        "operation_kind": "document_background_ingestion",
    }


def test_document_background_ingestion_logs_structured_success(
    api_client: TestClient,
    configure_upload_provider,
    monkeypatch,
    tmp_path,
) -> None:
    del configure_upload_provider
    ingestion_logger = LoggerSpy()
    stub_document_index_embedding(monkeypatch)
    monkeypatch.setattr(
        "knowledge_chatbox_api.services.documents.ingestion_service.logger",
        ingestion_logger,
    )
    monkeypatch.setattr(
        "knowledge_chatbox_api.tasks.document_jobs.complete_document_ingestion",
        lambda *_args: True,
    )

    login_as_admin(api_client)
    payload = upload_image_document(
        api_client,
        content=b"\x89PNG\r\n\x1a\n",
    )
    revision_id = payload["revision"]["id"]
    document_id = payload["document"]["id"]
    normalized_path = tmp_path / "normalized" / "image.md"

    def _ingest_revision(self, *, document_version, file_type: str, use_vision: bool):
        del self, file_type, use_vision
        normalized_path.parent.mkdir(parents=True, exist_ok=True)
        normalized_path.write_text("normalized image content", encoding="utf-8")
        document_version.normalized_path = str(normalized_path)
        document_version.chunk_count = 1
        return (
            str(normalized_path),
            [],
            IngestionMetrics(index_latency_ms=34, normalize_latency_ms=12),
        )

    monkeypatch.setattr(IngestionService, "_ingest_revision", _ingest_revision)

    session_factory = create_session_factory()
    with session_factory() as session:
        revision = IngestionService(session, get_settings()).complete_document_ingestion(
            revision_id
        )
        assert revision.ingest_status == "indexed"

    assert ingestion_logger.records[-1] == {
        "event": "document_background_ingestion_completed",
        "level": "info",
        "background_processing_latency_ms": ANY,
        "chunk_count": 1,
        "document_id": document_id,
        "document_revision_id": revision_id,
        "file_size_bytes": payload["revision"]["file_size"],
        "file_type": "png",
        "filename": "image.png",
        "index_latency_ms": 34,
        "normalize_latency_ms": 12,
        "operation_kind": "document_background_ingestion",
    }
