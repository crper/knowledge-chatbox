from __future__ import annotations

from unittest.mock import ANY

from fastapi.testclient import TestClient

from knowledge_chatbox_api.core.config import get_settings
from knowledge_chatbox_api.db.session import create_session_factory
from knowledge_chatbox_api.services.documents.ingestion_service import IngestionService


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


class UnifiedResponseAdapterStub:
    def response(self, messages, settings) -> str:
        del messages, settings
        return "统一回答"

    def stream_response(self, messages, settings):
        del messages, settings
        yield {"type": "text_delta", "delta": "统一"}
        yield {"type": "text_delta", "delta": "回答"}
        yield {"type": "completed", "usage": {"output_tokens": 2}}


class EmbeddingAdapterStub:
    def embed(self, texts: list[str], settings) -> list[list[float]]:
        del settings
        return [[0.1] * 384 for _ in texts]


class FailingEmbeddingAdapterStub:
    def embed(self, texts: list[str], settings) -> list[list[float]]:
        del texts, settings
        raise RuntimeError("embedding backend unavailable")


class FailingResponseAdapterStub:
    def response(self, messages, settings) -> str:
        del messages, settings
        raise RuntimeError("provider backend unavailable")


def login_admin(api_client: TestClient) -> None:
    response = api_client.post(
        "/api/auth/login",
        json={"username": "admin", "password": "admin123456"},
    )
    assert response.status_code == 200


def stub_document_index_embedding(monkeypatch) -> None:
    monkeypatch.setattr(
        "knowledge_chatbox_api.services.documents.ingestion_service.build_embedding_adapter",
        lambda _route: EmbeddingAdapterStub(),
    )


def test_sync_chat_logs_prompt_and_response_summary(
    api_client: TestClient,
    configure_upload_provider,
    monkeypatch,
) -> None:
    del configure_upload_provider
    chat_logger = LoggerSpy()
    stub_document_index_embedding(monkeypatch)
    monkeypatch.setattr(
        "knowledge_chatbox_api.services.chat.chat_application_service.build_response_adapter_from_settings",
        lambda _settings_record: UnifiedResponseAdapterStub(),
    )
    monkeypatch.setattr(
        "knowledge_chatbox_api.services.chat.chat_application_service.build_embedding_adapter_from_settings",
        lambda _settings_record: EmbeddingAdapterStub(),
    )
    monkeypatch.setattr("knowledge_chatbox_api.services.chat.chat_service.logger", chat_logger)

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
    session_response = api_client.post("/api/chat/sessions", json={"title": "sync log session"})
    session_id = session_response.json()["data"]["id"]

    response = api_client.post(
        f"/api/chat/sessions/{session_id}/messages",
        json={
            "content": "How do I set up OpenAI?",
            "client_request_id": "req-chat-log-sync-1",
        },
    )

    assert response.status_code == 200
    assert chat_logger.records == [
        {
            "event": "chat_prompt_assembled",
            "level": "info",
            "attachment_count": 0,
            "attachment_revision_scope_count": 0,
            "response_model": "gpt-5.4",
            "response_provider": "openai",
            "retrieval_candidate_count": 1,
            "retrieval_latency_ms": ANY,
            "retrieved_source_count": 1,
            "retrieval_strategy": "vector",
            "session_id": session_id,
        },
        {
            "event": "chat_response_completed",
            "level": "info",
            "answer_length": 4,
            "attachment_count": 0,
            "response_model": "gpt-5.4",
            "response_provider": "openai",
            "source_count": 1,
            "session_id": session_id,
        },
    ]


def test_sync_chat_logs_lexical_retrieval_strategy_when_embedding_generation_fails(
    api_client: TestClient,
    configure_upload_provider,
    monkeypatch,
) -> None:
    del configure_upload_provider
    chat_logger = LoggerSpy()
    stub_document_index_embedding(monkeypatch)
    monkeypatch.setattr(
        "knowledge_chatbox_api.services.chat.chat_application_service.build_response_adapter_from_settings",
        lambda _settings_record: UnifiedResponseAdapterStub(),
    )
    monkeypatch.setattr(
        "knowledge_chatbox_api.services.chat.chat_application_service.build_embedding_adapter_from_settings",
        lambda _settings_record: FailingEmbeddingAdapterStub(),
    )
    monkeypatch.setattr("knowledge_chatbox_api.services.chat.chat_service.logger", chat_logger)

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
    session_response = api_client.post("/api/chat/sessions", json={"title": "lexical log session"})
    session_id = session_response.json()["data"]["id"]

    response = api_client.post(
        f"/api/chat/sessions/{session_id}/messages",
        json={
            "content": "How do I set up OpenAI?",
            "client_request_id": "req-chat-log-sync-lexical-1",
        },
    )

    assert response.status_code == 200
    assert chat_logger.records[0] == {
        "event": "chat_prompt_assembled",
        "level": "info",
        "attachment_count": 0,
        "attachment_revision_scope_count": 0,
        "response_model": "gpt-5.4",
        "response_provider": "openai",
        "retrieval_candidate_count": 1,
        "retrieval_latency_ms": ANY,
        "retrieved_source_count": 1,
        "retrieval_strategy": "lexical",
        "session_id": session_id,
    }


def test_stream_chat_logs_run_lifecycle(
    api_client: TestClient,
    monkeypatch,
) -> None:
    run_logger = LoggerSpy()
    monkeypatch.setattr(
        "knowledge_chatbox_api.services.chat.chat_application_service.build_response_adapter_from_settings",
        lambda _settings_record: UnifiedResponseAdapterStub(),
    )
    monkeypatch.setattr(
        "knowledge_chatbox_api.services.chat.chat_application_service.build_embedding_adapter_from_settings",
        lambda _settings_record: EmbeddingAdapterStub(),
    )
    monkeypatch.setattr("knowledge_chatbox_api.services.chat.chat_run_service.logger", run_logger)

    login_admin(api_client)
    session_response = api_client.post("/api/chat/sessions", json={"title": "stream log session"})
    session_id = session_response.json()["data"]["id"]

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
            "response_model": "gpt-5.4",
            "response_provider": "openai",
            "run_id": 1,
            "session_id": session_id,
        },
        {
            "event": "chat_stream_run_completed",
            "level": "info",
            "assistant_message_id": 2,
            "response_model": "gpt-5.4",
            "response_provider": "openai",
            "run_id": 1,
            "session_id": session_id,
            "source_count": 0,
        },
    ]


def test_sync_chat_logs_failure_summary(
    api_client: TestClient,
    monkeypatch,
) -> None:
    sync_logger = LoggerSpy()
    monkeypatch.setattr(
        "knowledge_chatbox_api.services.chat.chat_application_service.build_response_adapter_from_settings",
        lambda _settings_record: FailingResponseAdapterStub(),
    )
    monkeypatch.setattr(
        "knowledge_chatbox_api.services.chat.chat_application_service.build_embedding_adapter_from_settings",
        lambda _settings_record: EmbeddingAdapterStub(),
    )
    monkeypatch.setattr(
        "knowledge_chatbox_api.services.chat.chat_application_service.logger",
        sync_logger,
    )

    login_admin(api_client)
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
            "level": "warning",
            "error_message": "provider backend unavailable",
            "failure_type": "chat_answer_error",
            "response_model": "gpt-5.4",
            "response_provider": "openai",
            "session_id": session_id,
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
    monkeypatch.setattr(IngestionService, "logger", ingestion_logger)

    login_admin(api_client)
    response = api_client.post(
        "/api/documents/upload",
        files={"file": ("note.txt", b"hello world", "text/plain")},
    )

    assert response.status_code == 201
    payload = response.json()["data"]
    assert ingestion_logger.records == [
        {
            "event": "document_upload_completed",
            "level": "info",
            "background_processing": False,
            "deduplicated": False,
            "document_id": payload["document"]["id"],
            "document_revision_id": payload["revision"]["id"],
            "file_type": "txt",
            "filename": "note.txt",
        }
    ]


def test_document_background_ingestion_logs_structured_failure(
    api_client: TestClient,
    configure_upload_provider,
    monkeypatch,
) -> None:
    del configure_upload_provider
    ingestion_logger = LoggerSpy()
    monkeypatch.setattr(IngestionService, "logger", ingestion_logger)
    monkeypatch.setattr(
        "knowledge_chatbox_api.tasks.document_jobs.complete_document_ingestion",
        lambda *_args: True,
    )

    login_admin(api_client)
    upload_response = api_client.post(
        "/api/documents/upload",
        files={"file": ("image.png", b"\x89PNG\r\n\x1a\n", "image/png")},
    )
    assert upload_response.status_code == 202
    revision_id = upload_response.json()["data"]["revision"]["id"]

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
    }
