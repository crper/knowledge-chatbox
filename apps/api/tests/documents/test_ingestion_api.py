from __future__ import annotations

from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from knowledge_chatbox_api.core.config import get_settings
from knowledge_chatbox_api.db.session import create_session_factory
from knowledge_chatbox_api.repositories.document_repository import DocumentRepository
from knowledge_chatbox_api.services.documents.ingestion_service import IngestionService
from knowledge_chatbox_api.services.settings.settings_service import (
    INDEX_REBUILD_STATUS_RUNNING,
    SettingsService,
)
from knowledge_chatbox_api.utils.chroma import get_chroma_store


def login_admin(api_client: TestClient) -> None:
    response = api_client.post(
        "/api/auth/login",
        json={"username": "admin", "password": "admin123456"},
    )
    assert response.status_code == 200


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

    def _explode_normalize(self, origin_path: str, file_type: str):
        del self, origin_path, file_type
        raise RuntimeError("normalize exploded")

    monkeypatch.setattr(IngestionService, "_normalize_document", _explode_normalize)

    response = api_client.post(
        "/api/documents/upload",
        files={"file": ("note.txt", b"hello world", "text/plain")},
    )

    assert response.status_code == 500
    current_uploads = {path.name for path in upload_dir.iterdir()}
    assert current_uploads == existing_uploads
