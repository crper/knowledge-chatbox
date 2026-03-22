from __future__ import annotations

from pathlib import Path

import pytest
from sqlalchemy.exc import IntegrityError

import knowledge_chatbox_api.models.document as document_models
from knowledge_chatbox_api.core.config import get_settings
from knowledge_chatbox_api.models.auth import User
from knowledge_chatbox_api.models.document import Document, DocumentRevision
from knowledge_chatbox_api.models.space import Space
from knowledge_chatbox_api.services.documents.versioning_service import VersioningService


def test_document_models_use_document_revision_name_only() -> None:
    assert hasattr(document_models, "DocumentRevision")
    assert not hasattr(document_models, "DocumentVersion")


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


def create_space(migrated_db_session, admin: User, slug: str = "space-a") -> Space:
    knowledge_base = Space(
        owner_user_id=admin.id,
        slug=slug,
        name=slug,
        kind="personal",
    )
    migrated_db_session.add(knowledge_base)
    migrated_db_session.commit()
    migrated_db_session.refresh(knowledge_base)
    return knowledge_base


def create_versioning_service(migrated_db_session) -> VersioningService:
    return VersioningService(migrated_db_session, get_settings())


def test_document_logical_name_must_be_unique_within_knowledge_base(migrated_db_session) -> None:
    admin = create_admin(migrated_db_session)
    knowledge_base = create_space(migrated_db_session, admin)

    first_document = Document(
        knowledge_base_id=knowledge_base.id,
        name="spec.pdf",
        logical_name="spec.pdf",
        status="active",
        current_version_number=1,
        created_by_user_id=admin.id,
        updated_by_user_id=admin.id,
    )
    duplicated_document = Document(
        knowledge_base_id=knowledge_base.id,
        name="spec copy.pdf",
        logical_name="spec.pdf",
        status="active",
        current_version_number=1,
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
    document = Document(
        knowledge_base_id=knowledge_base.id,
        name="spec.pdf",
        logical_name="spec.pdf",
        status="active",
        current_version_number=1,
        created_by_user_id=admin.id,
        updated_by_user_id=admin.id,
    )
    migrated_db_session.add(document)
    migrated_db_session.commit()
    migrated_db_session.refresh(document)

    first_version = DocumentRevision(
        document_id=document.id,
        version_number=1,
        file_name="spec.pdf",
        content_hash="hash-1",
        file_type="pdf",
        lifecycle_status="indexed",
        origin_path="/uploads/spec.pdf",
        normalized_path="/normalized/spec.md",
        created_by_user_id=admin.id,
        updated_by_user_id=admin.id,
    )
    duplicate_version = DocumentRevision(
        document_id=document.id,
        version_number=1,
        file_name="spec-copy.pdf",
        content_hash="hash-2",
        file_type="pdf",
        lifecycle_status="uploaded",
        origin_path="/uploads/spec-copy.pdf",
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

    result = service.create_document_version(
        actor=admin,
        filename="spec.pdf",
        content=b"hello world",
        file_type="pdf",
    )

    assert result.document.current_version_number == 1
    assert result.document.logical_name == "spec.pdf"
    assert result.version.version_number == 1
    assert result.version.document_id == result.document.id
    assert result.version.supersedes_version_id is None
    assert result.duplicate_content is False
    assert Path(result.version.origin_path).exists()


def test_same_name_upload_creates_new_version_and_updates_document_pointer(
    migrated_db_session,
    monkeypatch: pytest.MonkeyPatch,
    tmp_path: Path,
) -> None:
    monkeypatch.setenv("UPLOAD_DIR", str(tmp_path / "uploads"))
    admin = create_admin(migrated_db_session)
    service = create_versioning_service(migrated_db_session)

    first = service.create_document_version(
        actor=admin,
        filename="spec.pdf",
        content=b"first version",
        file_type="pdf",
    )
    second = service.create_document_version(
        actor=admin,
        filename="spec.pdf",
        content=b"second version",
        file_type="pdf",
    )

    document = migrated_db_session.get(Document, first.document.id)
    first_version = migrated_db_session.get(DocumentRevision, first.version.id)
    second_version = migrated_db_session.get(DocumentRevision, second.version.id)

    assert document is not None
    assert first_version is not None
    assert second_version is not None
    assert document.current_version_number == 2
    assert second_version.version_number == 2
    assert second_version.supersedes_version_id == first_version.id


def test_duplicate_hash_reuses_latest_version_without_creating_new_version(
    migrated_db_session,
    monkeypatch: pytest.MonkeyPatch,
    tmp_path: Path,
) -> None:
    monkeypatch.setenv("UPLOAD_DIR", str(tmp_path / "uploads"))
    admin = create_admin(migrated_db_session)
    service = create_versioning_service(migrated_db_session)

    first = service.create_document_version(
        actor=admin,
        filename="spec.pdf",
        content=b"same content",
        file_type="pdf",
    )
    second = service.create_document_version(
        actor=admin,
        filename="spec.pdf",
        content=b"same content",
        file_type="pdf",
    )

    assert first.document.id == second.document.id
    assert first.version.id == second.version.id
    assert second.version.version_number == 1
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
    assert len(list((tmp_path / "uploads").glob("*"))) == 1


def test_versioning_service_joins_caller_transaction(
    migrated_db_session,
    monkeypatch: pytest.MonkeyPatch,
    tmp_path: Path,
) -> None:
    monkeypatch.setenv("UPLOAD_DIR", str(tmp_path / "uploads"))
    admin = create_admin(migrated_db_session)
    service = create_versioning_service(migrated_db_session)

    result = service.create_document_version(
        actor=admin,
        filename="draft.pdf",
        content=b"draft version",
        file_type="pdf",
    )

    migrated_db_session.rollback()

    assert migrated_db_session.get(Document, result.document.id) is None
    assert migrated_db_session.get(DocumentRevision, result.version.id) is None
