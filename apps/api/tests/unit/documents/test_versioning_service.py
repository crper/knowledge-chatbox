from __future__ import annotations

import hashlib
from pathlib import Path

import pytest
from sqlalchemy.exc import IntegrityError
from tests.fixtures.factories import (
    DocumentFactory,
    DocumentRevisionFactory,
    SpaceFactory,
    UserFactory,
)

from knowledge_chatbox_api.core.config import get_settings
from knowledge_chatbox_api.models.document import Document, DocumentRevision
from knowledge_chatbox_api.services.documents.versioning_service import VersioningService
from knowledge_chatbox_api.utils.files import PersistedUpload


def create_admin(migrated_db_session):
    return UserFactory.persisted_create(
        migrated_db_session,
        username="admin",
        role="admin",
    )


def create_space(migrated_db_session, admin, slug: str = "space-a"):
    return SpaceFactory.persisted_create(
        migrated_db_session,
        owner_user_id=admin.id,
        slug=slug,
        name=slug,
        kind="personal",
    )


def create_versioning_service(migrated_db_session) -> VersioningService:
    return VersioningService(migrated_db_session, get_settings())


def create_persisted_upload(tmp_path: Path, filename: str, content: bytes) -> PersistedUpload:
    path = tmp_path / filename
    path.write_bytes(content)
    return PersistedUpload(
        path=path,
        content_hash=hashlib.sha256(content).hexdigest(),
        file_size=len(content),
    )


def test_document_logical_name_must_be_unique_within_knowledge_base(migrated_db_session) -> None:
    admin = create_admin(migrated_db_session)
    knowledge_base = create_space(migrated_db_session, admin)

    first_document = DocumentFactory.build(
        space_id=knowledge_base.id,
        title="spec.pdf",
        logical_name="spec.pdf",
        created_by_user_id=admin.id,
        updated_by_user_id=admin.id,
    )
    duplicated_document = DocumentFactory.build(
        space_id=knowledge_base.id,
        title="spec copy.pdf",
        logical_name="spec.pdf",
        created_by_user_id=admin.id,
        updated_by_user_id=admin.id,
    )

    migrated_db_session.add(first_document)
    migrated_db_session.commit()
    migrated_db_session.add(duplicated_document)

    with pytest.raises(IntegrityError):
        migrated_db_session.commit()


def test_document_version_number_must_be_unique_within_document(migrated_db_session) -> None:
    admin = create_admin(migrated_db_session)
    knowledge_base = create_space(migrated_db_session, admin)
    document = DocumentFactory.persisted_create(
        migrated_db_session,
        space_id=knowledge_base.id,
        title="spec.pdf",
        logical_name="spec.pdf",
        created_by_user_id=admin.id,
        updated_by_user_id=admin.id,
    )

    first_version = DocumentRevisionFactory.build(
        document_id=document.id,
        revision_no=1,
        source_filename="spec.pdf",
        ingest_status="indexed",
        source_path="/uploads/spec.pdf",
        created_by_user_id=admin.id,
        updated_by_user_id=admin.id,
    )
    duplicate_version = DocumentRevisionFactory.build(
        document_id=document.id,
        revision_no=1,
        source_filename="spec-copy.pdf",
        ingest_status="uploaded",
        source_path="/uploads/spec-copy.pdf",
        created_by_user_id=admin.id,
        updated_by_user_id=admin.id,
    )

    migrated_db_session.add(first_version)
    migrated_db_session.commit()
    migrated_db_session.add(duplicate_version)

    with pytest.raises(IntegrityError):
        migrated_db_session.commit()


def test_new_upload_creates_document_and_version_one(
    migrated_db_session,
    monkeypatch: pytest.MonkeyPatch,
    tmp_path: Path,
) -> None:
    monkeypatch.setenv("UPLOAD_DIR", str(tmp_path / "uploads"))
    admin = create_admin(migrated_db_session)
    service = create_versioning_service(migrated_db_session)
    upload_artifact = create_persisted_upload(tmp_path, "spec.pdf", b"hello world")

    result = service.create_document_version(
        actor=admin,
        filename="spec.pdf",
        upload_artifact=upload_artifact,
        file_type="pdf",
    )

    assert result.document.current_version_number == 1
    assert result.document.logical_name == "spec.pdf"
    assert result.version.revision_no == 1
    assert result.version.document_id == result.document.id
    assert result.version.mime_type == "application/pdf"
    assert result.version.supersedes_revision_id is None
    assert result.duplicate_content is False
    assert Path(result.version.source_path).exists()


def test_same_name_upload_creates_new_version_and_updates_document_pointer(
    migrated_db_session,
    monkeypatch: pytest.MonkeyPatch,
    tmp_path: Path,
) -> None:
    monkeypatch.setenv("UPLOAD_DIR", str(tmp_path / "uploads"))
    admin = create_admin(migrated_db_session)
    service = create_versioning_service(migrated_db_session)
    first_upload = create_persisted_upload(tmp_path, "first-spec.pdf", b"first version")
    second_upload = create_persisted_upload(tmp_path, "second-spec.pdf", b"second version")

    first = service.create_document_version(
        actor=admin,
        filename="spec.pdf",
        upload_artifact=first_upload,
        file_type="pdf",
    )
    second = service.create_document_version(
        actor=admin,
        filename="spec.pdf",
        upload_artifact=second_upload,
        file_type="pdf",
    )

    document = migrated_db_session.get(Document, first.document.id)
    first_version = migrated_db_session.get(DocumentRevision, first.version.id)
    second_version = migrated_db_session.get(DocumentRevision, second.version.id)

    assert document is not None
    assert first_version is not None
    assert second_version is not None
    assert document.current_version_number == 2
    assert second_version.revision_no == 2
    assert second_version.supersedes_revision_id == first_version.id


def test_duplicate_hash_reuses_latest_version_without_creating_new_version(
    migrated_db_session,
    monkeypatch: pytest.MonkeyPatch,
    tmp_path: Path,
) -> None:
    monkeypatch.setenv("UPLOAD_DIR", str(tmp_path / "uploads"))
    admin = create_admin(migrated_db_session)
    service = create_versioning_service(migrated_db_session)
    first_upload = create_persisted_upload(tmp_path, "first-spec.pdf", b"same content")
    duplicate_upload = create_persisted_upload(tmp_path, "duplicate-spec.pdf", b"same content")

    first = service.create_document_version(
        actor=admin,
        filename="spec.pdf",
        upload_artifact=first_upload,
        file_type="pdf",
    )
    second = service.create_document_version(
        actor=admin,
        filename="spec.pdf",
        upload_artifact=duplicate_upload,
        file_type="pdf",
    )

    assert first.document.id == second.document.id
    assert first.version.id == second.version.id
    assert second.version.revision_no == 1
    assert second.duplicate_content is True
    document = migrated_db_session.get(Document, first.document.id)
    versions = (
        migrated_db_session.query(DocumentRevision)
        .where(DocumentRevision.document_id == first.document.id)
        .all()
    )

    assert document is not None
    assert document.current_version_number == 1
    assert len(versions) == 1


def test_versioning_service_joins_caller_transaction(
    migrated_db_session,
    monkeypatch: pytest.MonkeyPatch,
    tmp_path: Path,
) -> None:
    monkeypatch.setenv("UPLOAD_DIR", str(tmp_path / "uploads"))
    admin = create_admin(migrated_db_session)
    service = create_versioning_service(migrated_db_session)
    upload_artifact = create_persisted_upload(tmp_path, "draft.pdf", b"draft version")

    result = service.create_document_version(
        actor=admin,
        filename="draft.pdf",
        upload_artifact=upload_artifact,
        file_type="pdf",
    )

    migrated_db_session.rollback()

    assert migrated_db_session.get(Document, result.document.id) is None
    assert migrated_db_session.get(DocumentRevision, result.version.id) is None
