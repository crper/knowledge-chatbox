from __future__ import annotations

from pathlib import Path

import pytest
from sqlalchemy import text

from knowledge_chatbox_api.core.config import get_settings
from knowledge_chatbox_api.models.auth import User
from knowledge_chatbox_api.models.document import Document, DocumentRevision
from knowledge_chatbox_api.models.space import Space
from knowledge_chatbox_api.services.documents.chunking_service import ChunkingService
from knowledge_chatbox_api.services.documents.errors import DocumentNotNormalizedError
from knowledge_chatbox_api.services.documents.indexing_service import IndexingService
from knowledge_chatbox_api.services.documents.rebuild_service import RebuildService
from knowledge_chatbox_api.services.settings.settings_service import (
    INDEX_REBUILD_STATUS_RUNNING,
    SettingsService,
)
from knowledge_chatbox_api.utils.chroma import InMemoryChromaStore


def create_admin(migrated_db_session) -> User:
    admin = User(
        username="admin",
        password_hash="hash",
        role="admin",
        status="active",
        theme_preference="system",
    )
    migrated_db_session.add(admin)
    migrated_db_session.commit()
    migrated_db_session.refresh(admin)
    return admin


def create_document(migrated_db_session) -> DocumentRevision:
    admin = create_admin(migrated_db_session)
    knowledge_base = Space(
        owner_user_id=admin.id,
        slug="default",
        name="default",
        kind="personal",
    )
    migrated_db_session.add(knowledge_base)
    migrated_db_session.commit()
    migrated_db_session.refresh(knowledge_base)

    document = Document(
        knowledge_base_id=knowledge_base.id,
        name="spec.md",
        logical_name="spec.md",
        status="active",
        current_version_number=1,
        created_by_user_id=admin.id,
        updated_by_user_id=admin.id,
    )
    migrated_db_session.add(document)
    migrated_db_session.commit()
    migrated_db_session.refresh(document)

    document_version = DocumentRevision(
        document_id=document.id,
        version_number=1,
        file_name="spec.md",
        content_hash="hash-1",
        file_type="md",
        lifecycle_status="indexed",
        origin_path="/uploads/spec.md",
        normalized_path="/normalized/spec.md",
        created_by_user_id=admin.id,
        updated_by_user_id=admin.id,
    )
    migrated_db_session.add(document_version)
    migrated_db_session.commit()
    migrated_db_session.refresh(document_version)
    return document_version


def test_rebuild_service_promotes_pending_embedding_route(
    migrated_db_session, tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    class EmbeddingAdapterStub:
        def embed(self, texts: list[str], provider_settings) -> list[list[float]]:
            del provider_settings
            return [[0.1, 0.2, 0.3] for _ in texts]

    settings = get_settings()
    service = SettingsService(migrated_db_session, settings)
    settings_record = service.get_or_create_settings_record()
    active_generation = settings_record.active_index_generation
    settings_record.pending_embedding_route_json = {
        "provider": "openai",
        "model": "text-embedding-3-large",
    }
    settings_record.index_rebuild_status = INDEX_REBUILD_STATUS_RUNNING
    settings_record.building_index_generation = active_generation + 1
    target_generation = settings_record.building_index_generation
    migrated_db_session.commit()

    document_version = create_document(migrated_db_session)
    normalized_path = Path(tmp_path / "spec.md")
    normalized_path.write_text("# Title\n\ncontent for rebuild", encoding="utf-8")
    document_version.normalized_path = str(normalized_path)
    migrated_db_session.commit()

    monkeypatch.setattr(
        "knowledge_chatbox_api.services.documents.rebuild_service.build_embedding_adapter",
        lambda route: EmbeddingAdapterStub(),
    )
    rebuild = RebuildService(migrated_db_session, settings)
    processed = rebuild.rebuild_building_generation(target_generation)

    refreshed = service.get_or_create_settings_record()
    migrated_db_session.refresh(refreshed)

    assert processed == 1
    assert refreshed.embedding_route.model_dump() == {
        "provider": "openai",
        "model": "text-embedding-3-large",
    }
    assert refreshed.pending_embedding_route is None
    assert refreshed.active_index_generation == active_generation + 1
    assert refreshed.building_index_generation is None
    assert refreshed.index_rebuild_status == "idle"
    lexical_rows = migrated_db_session.execute(
        text(
            """
            SELECT COUNT(*)
            FROM retrieval_chunks_fts
            WHERE generation = :generation
            """
        ),
        {"generation": target_generation},
    ).scalar_one()
    assert lexical_rows > 0


def test_rebuild_service_marks_failed_when_pending_embedding_route_missing(
    migrated_db_session,
) -> None:
    settings = get_settings()
    service = SettingsService(migrated_db_session, settings)
    settings_record = service.get_or_create_settings_record()
    active_generation = settings_record.active_index_generation
    settings_record.pending_embedding_route_json = None
    settings_record.index_rebuild_status = INDEX_REBUILD_STATUS_RUNNING
    settings_record.building_index_generation = active_generation + 1
    target_generation = settings_record.building_index_generation
    migrated_db_session.commit()

    rebuild = RebuildService(migrated_db_session, settings)
    processed = rebuild.rebuild_building_generation(target_generation)

    refreshed = service.get_or_create_settings_record()
    migrated_db_session.refresh(refreshed)

    assert processed == 0
    assert refreshed.active_index_generation == active_generation
    assert refreshed.building_index_generation == target_generation
    assert refreshed.index_rebuild_status == "failed"


def test_indexing_service_raises_when_embedding_generation_fails(
    migrated_db_session,
) -> None:
    class FailingEmbeddingAdapter:
        def embed(self, texts: list[str], settings) -> list[list[float]]:
            del texts, settings
            raise RuntimeError("embedding backend unavailable")

    settings = get_settings()
    service = SettingsService(migrated_db_session, settings)
    settings_record = service.get_or_create_settings_record()
    document_version = create_document(migrated_db_session)
    indexing_service = IndexingService(
        session=migrated_db_session,
        chunking_service=ChunkingService(),
        chroma_store=InMemoryChromaStore(),
        embedding_provider=FailingEmbeddingAdapter(),
        settings=settings_record,
    )

    with pytest.raises(DocumentNotNormalizedError, match="embedding generation failed"):
        indexing_service.index_document(document_version, "# Title\n\ncontent for rebuild")


def test_indexing_service_persists_and_deletes_lexical_chunks_by_generation(
    migrated_db_session,
) -> None:
    class EmbeddingAdapterStub:
        def embed(self, texts: list[str], settings) -> list[list[float]]:
            del settings
            return [[0.1, 0.2, 0.3] for _ in texts]

    settings = get_settings()
    service = SettingsService(migrated_db_session, settings)
    settings_record = service.get_or_create_settings_record()
    document_version = create_document(migrated_db_session)
    indexing_service = IndexingService(
        session=migrated_db_session,
        chunking_service=ChunkingService(),
        chroma_store=InMemoryChromaStore(),
        embedding_provider=EmbeddingAdapterStub(),
        settings=settings_record,
    )

    indexing_service.index_document(
        document_version,
        "# Title\n\ncontent for rebuild",
        generation=3,
        section_title="Title",
    )

    lexical_rows = migrated_db_session.execute(
        text(
            "SELECT chunk_id, generation, document_revision_id, document_id, space_id, "
            "section_title "
            "FROM retrieval_chunks_fts WHERE generation = 3"
        )
    ).fetchall()

    assert len(lexical_rows) == 2
    assert {row.chunk_id for row in lexical_rows} == {
        f"{document_version.id}:0",
        f"{document_version.id}:1",
    }
    assert {row.document_revision_id for row in lexical_rows} == {document_version.id}
    assert {row.document_id for row in lexical_rows} == {document_version.document_id}
    assert {row.generation for row in lexical_rows} == {3}
    assert {row.section_title for row in lexical_rows} == {"Title"}

    indexing_service.delete_document_chunks(document_version, generation=3)

    remaining = migrated_db_session.execute(
        text("SELECT COUNT(*) FROM retrieval_chunks_fts WHERE generation = 3")
    ).scalar_one()
    assert remaining == 0
