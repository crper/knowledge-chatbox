from __future__ import annotations

from pathlib import Path
from types import SimpleNamespace
from typing import TYPE_CHECKING, cast

import pytest
from sqlalchemy import text
from tests.fixtures.helpers import (
    login_as_admin,
    upload_image_document,
    upload_text_document,
)
from tests.fixtures.stubs import (
    EmbeddingAdapterStub,
    InMemoryChromaStore,
    patch_document_index_embedding,
)

from knowledge_chatbox_api.core.config import get_settings
from knowledge_chatbox_api.db.session import create_session_factory
from knowledge_chatbox_api.models.enums import IndexRebuildStatus
from knowledge_chatbox_api.repositories.document_repository import DocumentRepository
from knowledge_chatbox_api.services.documents.chunking_service import ChunkingService
from knowledge_chatbox_api.services.documents.indexing_service import IndexingService
from knowledge_chatbox_api.services.documents.ingestion_service import IngestionService
from knowledge_chatbox_api.services.settings.settings_service import SettingsService
from knowledge_chatbox_api.tasks import document_jobs
from knowledge_chatbox_api.utils.chroma import get_chroma_store
from knowledge_chatbox_api.utils.document_types import derive_section_title

if TYPE_CHECKING:
    from fastapi.testclient import TestClient
    from knowledge_chatbox_api.models.user import User

    from knowledge_chatbox_api.schemas.settings import ProviderRuntimeSettings


def ensure_default_ollama_provider_profile() -> None:
    def ensure_ollama_url(provider_profiles, settings_record) -> None:
        provider_profiles["ollama"]["base_url"] = "http://localhost:11434"
        settings_record.pending_embedding_route_json = None
        settings_record.index_rebuild_status = "idle"
        settings_record.building_index_generation = None

    update_provider_profiles(ensure_ollama_url)


def prepare_ingestion_api_client(api_client: TestClient) -> None:
    login_as_admin(api_client)
    ensure_default_ollama_provider_profile()


def write_normalized_fixture(path: Path, content: str = "normalized image content") -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(content, encoding="utf-8")


class NoSnapshotChromaStore(InMemoryChromaStore):
    def __init__(self) -> None:
        super().__init__()
        self.fail_next_upsert = False

    def list_by_revision_id(self, revision_id: int, *, generation: int = 1):
        del revision_id, generation
        raise AssertionError("snapshot reads should not happen in rollback paths")

    def upsert(self, records, *, embeddings=None, generation=1):
        if self.fail_next_upsert:
            self.fail_next_upsert = False
            raise RuntimeError("simulated chroma failure")
        return super().upsert(records, embeddings=embeddings, generation=generation)


@pytest.fixture(autouse=True)
def stub_document_index_embedding(monkeypatch: pytest.MonkeyPatch) -> None:
    patch_document_index_embedding(
        monkeypatch,
        adapter=EmbeddingAdapterStub(values=[0.1, 0.2, 0.3]),
    )


def count_lexical_rows(revision_id: int, *, generation: int) -> int:
    session_factory = create_session_factory()
    with session_factory() as session:
        return session.execute(
            text(
                """
                SELECT COUNT(*)
                FROM retrieval_chunks_fts
                WHERE document_revision_id = :document_revision_id
                  AND generation = :generation
                """
            ),
            {
                "document_revision_id": revision_id,
                "generation": generation,
            },
        ).scalar_one()


def get_active_generation() -> int:
    session_factory = create_session_factory()
    with session_factory() as session:
        settings_record = SettingsService(session, get_settings()).get_or_create_settings_record()
        return settings_record.active_index_generation


def update_provider_profiles(mutator) -> None:
    session_factory = create_session_factory()
    with session_factory() as session:
        settings_record = SettingsService(session, get_settings()).get_or_create_settings_record()
        provider_profiles = settings_record.provider_profiles.model_dump()
        mutator(provider_profiles, settings_record)
        settings_record.provider_profiles_json = provider_profiles
        session.commit()


def seed_in_memory_store_for_revision(
    session,
    store: InMemoryChromaStore,
    revision_id: int,
) -> None:
    settings_record = SettingsService(session, get_settings()).get_or_create_settings_record()
    revision = DocumentRepository(session).get_by_id(revision_id)
    assert revision is not None
    assert revision.normalized_path is not None
    content = Path(revision.normalized_path).read_text(encoding="utf-8")
    IndexingService(
        session=session,
        chunking_service=ChunkingService(),
        chroma_store=store,
        embedding_provider=EmbeddingAdapterStub(values=[0.1, 0.2, 0.3]),
        settings=cast("ProviderRuntimeSettings", settings_record),
    ).index_document(
        revision,
        content,
        generation=settings_record.active_index_generation,
        section_title=derive_section_title(content),
    )
    session.commit()


def test_upload_document_indexes_active_generation(api_client: TestClient) -> None:
    prepare_ingestion_api_client(api_client)
    active_generation = get_active_generation()

    payload = upload_text_document(api_client)
    assert payload["revision"]["ingest_status"] == "indexed"
    assert payload["document"]["latest_revision"]["id"] == payload["revision"]["id"]
    assert count_lexical_rows(payload["revision"]["id"], generation=active_generation) > 0


def test_upload_readiness_blocks_when_active_embedding_is_not_configured(
    api_client: TestClient,
) -> None:
    prepare_ingestion_api_client(api_client)

    def clear_ollama_url(provider_profiles, _settings_record) -> None:
        provider_profiles["ollama"]["base_url"] = ""

    update_provider_profiles(clear_ollama_url)

    response = api_client.get("/api/documents/upload-readiness")

    assert response.status_code == 200
    assert response.json()["data"] == {
        "blocking_reason": "embedding_not_configured",
        "can_upload": False,
        "image_fallback": False,
    }


def test_upload_readiness_marks_images_as_fallback_when_vision_is_not_configured(
    api_client: TestClient,
) -> None:
    prepare_ingestion_api_client(api_client)

    def route_vision_to_anthropic(provider_profiles, settings_record) -> None:
        provider_profiles["anthropic"]["api_key"] = None
        settings_record.vision_route_json = {
            "provider": "anthropic",
            "model": "claude-sonnet-4-5",
        }

    update_provider_profiles(route_vision_to_anthropic)

    response = api_client.get("/api/documents/upload-readiness")

    assert response.status_code == 200
    assert response.json()["data"] == {
        "blocking_reason": None,
        "can_upload": True,
        "image_fallback": True,
    }


def test_upload_readiness_blocks_when_pending_embedding_is_not_configured(
    api_client: TestClient,
) -> None:
    prepare_ingestion_api_client(api_client)

    def break_pending_voyage(provider_profiles, settings_record) -> None:
        provider_profiles["voyage"]["api_key"] = None
        settings_record.pending_embedding_route_json = {
            "provider": "voyage",
            "model": "voyage-3.5",
        }
        settings_record.index_rebuild_status = IndexRebuildStatus.RUNNING
        settings_record.building_index_generation = settings_record.active_index_generation + 1

    update_provider_profiles(break_pending_voyage)

    response = api_client.get("/api/documents/upload-readiness")

    assert response.status_code == 200
    assert response.json()["data"] == {
        "blocking_reason": "pending_embedding_not_configured",
        "can_upload": False,
        "image_fallback": False,
    }


def test_documents_summary_counts_latest_pending_documents(
    api_client: TestClient,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    prepare_ingestion_api_client(api_client)
    monkeypatch.setattr(
        "knowledge_chatbox_api.api.routes.documents.document_jobs.complete_document_ingestion",
        lambda *_args, **_kwargs: False,
    )

    settled_payload = upload_text_document(api_client, filename="settled.txt")
    pending_payload = upload_image_document(api_client, filename="pending.png")
    summary_response = api_client.get("/api/documents/summary")

    assert settled_payload["revision"]["ingest_status"] == "indexed"
    assert pending_payload["revision"]["ingest_status"] == "processing"
    assert summary_response.status_code == 200
    assert summary_response.json()["data"] == {
        "pending_count": 1,
    }


def test_upload_document_writes_to_building_generation_when_rebuild_running(
    api_client: TestClient,
    tmp_path: Path,
) -> None:
    del tmp_path
    prepare_ingestion_api_client(api_client)

    settings = get_settings()
    session_factory = create_session_factory()
    with session_factory() as session:
        service = SettingsService(session, settings)
        settings_record = service.get_or_create_settings_record()
        settings_record.pending_embedding_route_json = {
            "provider": "ollama",
            "model": "nomic-embed-text",
        }
        settings_record.index_rebuild_status = IndexRebuildStatus.RUNNING
        settings_record.building_index_generation = settings_record.active_index_generation + 1
        active_generation = settings_record.active_index_generation
        building_generation = settings_record.building_index_generation
        assert active_generation is not None
        assert building_generation is not None
        session.commit()

    payload = upload_text_document(api_client)
    revision_id = payload["revision"]["id"]
    store = get_chroma_store()
    assert store.list_by_revision_id(revision_id, generation=active_generation)
    assert store.list_by_revision_id(revision_id, generation=building_generation)
    assert count_lexical_rows(revision_id, generation=active_generation) > 0
    assert count_lexical_rows(revision_id, generation=building_generation) > 0


def test_upload_document_returns_conflict_before_saving_file_when_embedding_is_not_configured(
    api_client: TestClient,
) -> None:
    prepare_ingestion_api_client(api_client)
    upload_dir = get_settings().upload_dir
    existing_uploads: set[str] = (
        {path.name for path in upload_dir.iterdir()} if upload_dir.exists() else set()
    )

    def clear_ollama_url(provider_profiles, _settings_record) -> None:
        provider_profiles["ollama"]["base_url"] = ""

    update_provider_profiles(clear_ollama_url)

    conflict_response = api_client.post(
        "/api/documents/upload",
        files={"file": ("note.txt", b"hello world", "text/plain")},
    )

    assert conflict_response.status_code == 409
    assert conflict_response.json()["error"]["code"] == "embedding_not_configured"
    current_uploads: set[str] = (
        {path.name for path in upload_dir.iterdir()} if upload_dir.exists() else set()
    )
    assert current_uploads == existing_uploads


def test_upload_document_returns_existing_revision_for_duplicate_content(
    api_client: TestClient,
) -> None:
    prepare_ingestion_api_client(api_client)
    upload_dir = get_settings().upload_dir
    existing_uploads: set[str] = (
        {path.name for path in upload_dir.iterdir()} if upload_dir.exists() else set()
    )

    first_payload = upload_text_document(api_client)
    assert first_payload["deduplicated"] is False

    store = get_chroma_store()
    first_chunks = store.list_by_revision_id(first_payload["revision"]["id"])
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

    second_chunks = store.list_by_revision_id(first_payload["revision"]["id"])
    assert len(second_chunks) == len(first_chunks)
    current_uploads = {path.name for path in upload_dir.iterdir()}
    assert len(current_uploads - existing_uploads) == 1


def test_list_documents_supports_query_type_and_status_filters(
    api_client: TestClient,
) -> None:
    prepare_ingestion_api_client(api_client)

    upload_text_document(api_client)
    upload_text_document(
        api_client,
        filename="guide.md",
        content=b"# Guide\n\nknowledge",
        content_type="text/markdown",
    )

    filtered_response = api_client.get(
        "/api/documents",
        params={"query": "guide", "type": "markdown", "status": "indexed"},
    )

    assert filtered_response.status_code == 200
    payload = filtered_response.json()["data"]
    assert len(payload) == 1
    assert payload[0]["title"] == "guide.md"
    assert payload[0]["latest_revision"]["file_type"] == "md"
    assert payload[0]["latest_revision"]["ingest_status"] == "indexed"


def test_reindex_document_returns_conflict_when_document_is_not_normalized(
    api_client: TestClient,
) -> None:
    prepare_ingestion_api_client(api_client)

    payload = upload_text_document(api_client)

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


def test_reindex_document_rebuilds_lexical_index_rows(
    api_client: TestClient,
) -> None:
    prepare_ingestion_api_client(api_client)
    active_generation = get_active_generation()

    payload = upload_text_document(api_client)
    revision_id = payload["revision"]["id"]
    document_id = payload["document"]["id"]

    assert count_lexical_rows(revision_id, generation=active_generation) > 0

    session_factory = create_session_factory()
    with session_factory() as session:
        session.execute(
            text(
                """
                DELETE FROM retrieval_chunks_fts
                WHERE document_revision_id = :document_revision_id
                  AND generation = :generation
                """
            ),
            {
                "document_revision_id": revision_id,
                "generation": active_generation,
            },
        )
        session.commit()

    assert count_lexical_rows(revision_id, generation=active_generation) == 0

    reindex_response = api_client.post(f"/api/documents/{document_id}/reindex")

    assert reindex_response.status_code == 200
    assert count_lexical_rows(revision_id, generation=active_generation) > 0


def test_reindex_document_returns_error_when_image_retry_still_fails(
    api_client: TestClient,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    prepare_ingestion_api_client(api_client)
    monkeypatch.setattr(document_jobs, "complete_document_ingestion", lambda *_args: True)

    payload = upload_image_document(api_client)

    def _explode_normalize(self, origin_path: str, file_type: str, *, use_vision: bool = True):
        del self, origin_path, file_type, use_vision
        raise RuntimeError("vision exploded")

    monkeypatch.setattr(IngestionService, "_normalize_document", _explode_normalize)

    reindex_response = api_client.post(f"/api/documents/{payload['document']['id']}/reindex")

    assert reindex_response.status_code == 500
    assert reindex_response.json()["error"] == {
        "code": "document_reindex_failed",
        "message": "Image processing failed.",
        "details": None,
    }


def test_delete_document_clears_lexical_index_rows(
    api_client: TestClient,
) -> None:
    prepare_ingestion_api_client(api_client)
    active_generation = get_active_generation()

    payload = upload_text_document(api_client)
    revision_id = payload["revision"]["id"]
    document_id = payload["document"]["id"]

    assert count_lexical_rows(revision_id, generation=active_generation) > 0

    delete_response = api_client.delete(f"/api/documents/{document_id}")

    assert delete_response.status_code == 200
    assert count_lexical_rows(revision_id, generation=active_generation) == 0


def test_reindex_document_restores_indexes_without_snapshot_reads(
    api_client: TestClient,
) -> None:
    prepare_ingestion_api_client(api_client)
    payload = upload_text_document(api_client)
    revision_id = payload["revision"]["id"]
    document_id = payload["document"]["id"]
    active_generation = get_active_generation()

    session_factory = create_session_factory()
    with session_factory() as session:
        store = NoSnapshotChromaStore()
        seed_in_memory_store_for_revision(session, store, revision_id)
        service = IngestionService(session, get_settings())
        service._chroma_store = store  # pyright: ignore[reportPrivateUsage,reportAttributeAccessIssue]
        store.fail_next_upsert = True

        with pytest.raises(RuntimeError, match="simulated chroma failure"):
            service.reindex_document(cast("User", SimpleNamespace(id=1)), document_id)

        assert store.query("hello", generation=active_generation)
        assert count_lexical_rows(revision_id, generation=active_generation) > 0


def test_delete_document_restores_indexes_without_snapshot_reads(
    api_client: TestClient,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    prepare_ingestion_api_client(api_client)
    upload_response = api_client.post(
        "/api/documents/upload",
        files={"file": ("note.txt", b"hello world", "text/plain")},
    )
    assert upload_response.status_code == 201
    payload = upload_response.json()["data"]
    revision_id = payload["revision"]["id"]
    document_id = payload["document"]["id"]
    active_generation = get_active_generation()

    session_factory = create_session_factory()
    with session_factory() as session:
        store = NoSnapshotChromaStore()
        seed_in_memory_store_for_revision(session, store, revision_id)
        service = IngestionService(session, get_settings())
        service._chroma_store = store  # pyright: ignore[reportPrivateUsage,reportAttributeAccessIssue]
        repository = DocumentRepository(session)
        original_commit = session.commit
        commit_calls = 0

        def fail_once_commit():
            nonlocal commit_calls
            commit_calls += 1
            if commit_calls == 1:
                raise RuntimeError("simulated commit failure")
            return original_commit()

        monkeypatch.setattr(session, "commit", fail_once_commit)

        with pytest.raises(RuntimeError, match="simulated commit failure"):
            service.delete_document(cast("User", SimpleNamespace(id=1)), document_id)

        assert repository.get_one_or_none(id=document_id) is not None
        assert store.query("hello", generation=active_generation)
        assert count_lexical_rows(revision_id, generation=active_generation) > 0


def test_upload_document_does_not_leak_internal_error_message(
    api_client: TestClient,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    prepare_ingestion_api_client(api_client)

    def _explode_upload_document(self, actor, filename: str, upload_artifact, content_type: str):
        del self, actor, filename, upload_artifact, content_type
        raise RuntimeError("internal parser exploded")

    monkeypatch.setattr(IngestionService, "upload_document", _explode_upload_document)

    error_response = api_client.post(
        "/api/documents/upload",
        files={"file": ("note.txt", b"hello world", "text/plain")},
    )

    assert error_response.status_code == 500
    assert error_response.json()["error"] == {
        "code": "document_upload_failed",
        "message": "Document upload failed.",
        "details": None,
    }


def test_upload_document_cleans_persisted_source_file_when_normalization_fails(
    api_client: TestClient,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    prepare_ingestion_api_client(api_client)
    upload_dir = get_settings().upload_dir
    existing_uploads: set[str] = (
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
    prepare_ingestion_api_client(api_client)
    completed_revision_ids: list[int] = []

    monkeypatch.setattr(
        document_jobs,
        "complete_document_ingestion",
        lambda _settings, revision_id: completed_revision_ids.append(revision_id) or True,
    )

    payload = upload_image_document(api_client)
    assert payload["revision"]["ingest_status"] == "processing"
    assert completed_revision_ids == [payload["revision"]["id"]]


def test_complete_document_ingestion_indexes_processing_image_revision(
    api_client: TestClient,
    monkeypatch: pytest.MonkeyPatch,
    tmp_path: Path,
) -> None:
    prepare_ingestion_api_client(api_client)
    monkeypatch.setattr(document_jobs, "complete_document_ingestion", lambda *_args: True)

    image_payload = upload_image_document(api_client)
    revision_id = image_payload["revision"]["id"]

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
        assert count_lexical_rows(revision_id, generation=get_active_generation()) > 0

    listed_response = api_client.get("/api/documents")
    assert listed_response.status_code == 200
    assert listed_response.json()["data"][0]["latest_revision"]["ingest_status"] == "indexed"


def test_complete_document_ingestion_marks_failed_image_revision_visible(
    api_client: TestClient,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    prepare_ingestion_api_client(api_client)
    monkeypatch.setattr(document_jobs, "complete_document_ingestion", lambda *_args: True)

    image_payload = upload_image_document(api_client)
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
        assert revision.normalized_path is None
        assert revision.error_message == "Image processing failed."

    listed_response = api_client.get("/api/documents")
    assert listed_response.status_code == 200
    assert listed_response.json()["data"][0]["latest_revision"]["ingest_status"] == "failed"


def test_compensate_processing_documents_resumes_processing_images(
    api_client: TestClient,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    prepare_ingestion_api_client(api_client)
    monkeypatch.setattr(document_jobs, "complete_document_ingestion", lambda *_args: True)

    image_payload = upload_image_document(api_client)
    revision_id = image_payload["revision"]["id"]

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
