from __future__ import annotations

from io import BytesIO
from pathlib import Path
from types import SimpleNamespace

import pytest
from fastapi.testclient import TestClient
from PIL import Image

from knowledge_chatbox_api.core.config import get_settings
from knowledge_chatbox_api.db.session import create_session_factory
from knowledge_chatbox_api.repositories.document_repository import DocumentRepository
from knowledge_chatbox_api.services.documents.ingestion_service import IngestionService
from knowledge_chatbox_api.services.settings.settings_service import (
    INDEX_REBUILD_STATUS_RUNNING,
    SettingsService,
)
from knowledge_chatbox_api.tasks import document_jobs
from knowledge_chatbox_api.utils.chroma import get_chroma_store


def login_admin(api_client: TestClient) -> None:
    response = api_client.post(
        "/api/auth/login",
        json={"username": "admin", "password": "admin123456"},
    )
    assert response.status_code == 200


def build_png_bytes() -> bytes:
    buffer = BytesIO()
    Image.new("RGB", (4, 4), color=(255, 0, 0)).save(buffer, format="PNG")
    return buffer.getvalue()


def write_normalized_fixture(path: Path, content: str = "normalized image content") -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(content, encoding="utf-8")


def test_upload_document_indexes_active_generation(api_client: TestClient) -> None:
    login_admin(api_client)

    response = api_client.post(
        "/api/documents/upload",
        files={"file": ("note.txt", b"hello world", "text/plain")},
    )

    assert response.status_code == 201
    payload = response.json()["data"]
    assert payload["revision"]["ingest_status"] == "indexed"
    assert payload["document"]["latest_revision"]["id"] == payload["revision"]["id"]


def test_upload_document_writes_to_building_generation_when_rebuild_running(
    api_client: TestClient,
    tmp_path: Path,
) -> None:
    del tmp_path
    login_admin(api_client)

    settings = get_settings()
    session_factory = create_session_factory()
    with session_factory() as session:
        service = SettingsService(session, settings)
        settings_record = service.get_or_create_settings_record()
        settings_record.pending_embedding_route_json = {
            "provider": "openai",
            "model": "text-embedding-3-large",
        }
        settings_record.index_rebuild_status = INDEX_REBUILD_STATUS_RUNNING
        settings_record.building_index_generation = settings_record.active_index_generation + 1
        active_generation = settings_record.active_index_generation
        building_generation = settings_record.building_index_generation
        session.commit()

    response = api_client.post(
        "/api/documents/upload",
        files={"file": ("note.txt", b"hello world", "text/plain")},
    )

    assert response.status_code == 201
    revision_id = response.json()["data"]["revision"]["id"]
    store = get_chroma_store()
    assert store.list_by_document_id(revision_id, generation=active_generation)
    assert store.list_by_document_id(revision_id, generation=building_generation)


def test_upload_document_returns_existing_revision_for_duplicate_content(
    api_client: TestClient,
) -> None:
    login_admin(api_client)
    upload_dir = get_settings().upload_dir
    existing_uploads = (
        {path.name for path in upload_dir.iterdir()} if upload_dir.exists() else set()
    )

    first_response = api_client.post(
        "/api/documents/upload",
        files={"file": ("note.txt", b"hello world", "text/plain")},
    )
    assert first_response.status_code == 201
    first_payload = first_response.json()["data"]
    assert first_payload["deduplicated"] is False

    store = get_chroma_store()
    first_chunks = store.list_by_document_id(first_payload["revision"]["id"])
    assert first_chunks

    second_response = api_client.post(
        "/api/documents/upload",
        files={"file": ("note.txt", b"hello world", "text/plain")},
    )

    assert second_response.status_code == 200
    second_payload = second_response.json()["data"]
    assert second_payload["deduplicated"] is True
    assert second_payload["document"]["id"] == first_payload["document"]["id"]
    assert second_payload["revision"]["id"] == first_payload["revision"]["id"]
    assert second_payload["latest_revision"]["revision_no"] == 1

    revisions_response = api_client.get(
        f"/api/documents/{first_payload['document']['id']}/revisions"
    )
    assert revisions_response.status_code == 200
    assert len(revisions_response.json()["data"]) == 1

    latest_response = api_client.get("/api/documents")
    assert latest_response.status_code == 200
    assert len(latest_response.json()["data"]) == 1

    second_chunks = store.list_by_document_id(first_payload["revision"]["id"])
    assert len(second_chunks) == len(first_chunks)
    current_uploads = {path.name for path in upload_dir.iterdir()}
    assert len(current_uploads - existing_uploads) == 1


def test_reindex_document_returns_conflict_when_document_is_not_normalized(
    api_client: TestClient,
) -> None:
    login_admin(api_client)

    upload_response = api_client.post(
        "/api/documents/upload",
        files={"file": ("note.txt", b"hello world", "text/plain")},
    )
    assert upload_response.status_code == 201
    payload = upload_response.json()["data"]

    session_factory = create_session_factory()
    with session_factory() as session:
        repository = DocumentRepository(session)
        revision = repository.get_by_id(payload["revision"]["id"])
        assert revision is not None
        revision.normalized_path = None
        session.commit()

    reindex_response = api_client.post(f"/api/documents/{payload['document']['id']}/reindex")

    assert reindex_response.status_code == 409
    assert reindex_response.json()["error"] == {
        "code": "document_not_normalized",
        "message": "Document has not been normalized yet.",
        "details": None,
    }


def test_upload_document_does_not_leak_internal_error_message(
    api_client: TestClient,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    login_admin(api_client)

    def _explode_upload_document(self, actor, filename: str, upload_artifact, content_type: str):
        del self, actor, filename, upload_artifact, content_type
        raise RuntimeError("internal parser exploded")

    monkeypatch.setattr(IngestionService, "upload_document", _explode_upload_document)

    response = api_client.post(
        "/api/documents/upload",
        files={"file": ("note.txt", b"hello world", "text/plain")},
    )

    assert response.status_code == 500
    assert response.json()["error"] == {
        "code": "document_upload_failed",
        "message": "Document upload failed.",
        "details": None,
    }


def test_upload_document_cleans_persisted_source_file_when_normalization_fails(
    api_client: TestClient,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    login_admin(api_client)
    upload_dir = get_settings().upload_dir
    existing_uploads = (
        {path.name for path in upload_dir.iterdir()} if upload_dir.exists() else set()
    )

    def _explode_normalize(self, origin_path: str, file_type: str, *, use_vision: bool = True):
        del self, origin_path, file_type, use_vision
        raise RuntimeError("normalize exploded")

    monkeypatch.setattr(IngestionService, "_normalize_document", _explode_normalize)

    response = api_client.post(
        "/api/documents/upload",
        files={"file": ("note.txt", b"hello world", "text/plain")},
    )

    assert response.status_code == 500
    current_uploads = {path.name for path in upload_dir.iterdir()}
    assert current_uploads == existing_uploads


def test_upload_image_returns_processing_and_schedules_background_ingestion(
    api_client: TestClient,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    login_admin(api_client)
    completed_revision_ids: list[int] = []

    monkeypatch.setattr(
        document_jobs,
        "complete_document_ingestion",
        lambda _settings, revision_id: completed_revision_ids.append(revision_id) or True,
    )

    response = api_client.post(
        "/api/documents/upload",
        files={"file": ("image.png", build_png_bytes(), "image/png")},
    )

    assert response.status_code == 202
    payload = response.json()["data"]
    assert payload["revision"]["ingest_status"] == "processing"
    assert payload["revision"]["normalized_path"] is None
    assert completed_revision_ids == [payload["revision"]["id"]]


def test_complete_document_ingestion_indexes_processing_image_revision(
    api_client: TestClient,
    monkeypatch: pytest.MonkeyPatch,
    tmp_path: Path,
) -> None:
    login_admin(api_client)
    monkeypatch.setattr(document_jobs, "complete_document_ingestion", lambda *_args: True)

    upload_response = api_client.post(
        "/api/documents/upload",
        files={"file": ("image.png", build_png_bytes(), "image/png")},
    )
    assert upload_response.status_code == 202
    revision_id = upload_response.json()["data"]["revision"]["id"]

    normalized_path = tmp_path / "normalized" / "image.md"

    def _normalize(self, origin_path: str, file_type: str, *, use_vision: bool = True):
        del self, origin_path, file_type, use_vision
        write_normalized_fixture(normalized_path)
        return SimpleNamespace(
            content="normalized image content",
            media_type="text/markdown",
            normalized_path=str(normalized_path),
        )

    monkeypatch.setattr(IngestionService, "_normalize_document", _normalize)

    session_factory = create_session_factory()
    with session_factory() as session:
        revision = IngestionService(session, get_settings()).complete_document_ingestion(
            revision_id
        )
        assert revision.ingest_status == "indexed"
        assert revision.normalized_path == str(normalized_path)
        assert revision.chunk_count is not None
        assert revision.indexed_at is not None

    listed_response = api_client.get("/api/documents")
    assert listed_response.status_code == 200
    assert listed_response.json()["data"][0]["latest_revision"]["ingest_status"] == "indexed"


def test_complete_document_ingestion_marks_failed_image_revision_visible(
    api_client: TestClient,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    login_admin(api_client)
    monkeypatch.setattr(document_jobs, "complete_document_ingestion", lambda *_args: True)

    upload_response = api_client.post(
        "/api/documents/upload",
        files={"file": ("image.png", build_png_bytes(), "image/png")},
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
        assert revision.normalized_path is None
        assert revision.error_message == "Image processing failed."

    listed_response = api_client.get("/api/documents")
    assert listed_response.status_code == 200
    assert listed_response.json()["data"][0]["latest_revision"]["ingest_status"] == "failed"


def test_compensate_processing_documents_resumes_processing_images(
    api_client: TestClient,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    login_admin(api_client)
    monkeypatch.setattr(document_jobs, "complete_document_ingestion", lambda *_args: True)

    upload_response = api_client.post(
        "/api/documents/upload",
        files={"file": ("image.png", build_png_bytes(), "image/png")},
    )
    assert upload_response.status_code == 202
    revision_id = upload_response.json()["data"]["revision"]["id"]

    resumed_revision_ids: list[int] = []
    monkeypatch.setattr(
        document_jobs,
        "complete_document_ingestion",
        lambda _settings, next_revision_id: resumed_revision_ids.append(next_revision_id) or True,
    )

    session_factory = create_session_factory()
    with session_factory() as session:
        resumed_count = document_jobs.compensate_processing_documents(session, get_settings())

    assert resumed_count == 1
    assert resumed_revision_ids == [revision_id]
