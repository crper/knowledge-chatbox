"""Document version creation and file write coordination."""

from dataclasses import dataclass
from pathlib import Path

from knowledge_chatbox_api.core.config import Settings
from knowledge_chatbox_api.models.auth import User
from knowledge_chatbox_api.models.document import Document, DocumentRevision
from knowledge_chatbox_api.models.enums import DocumentStatus, IngestStatus
from knowledge_chatbox_api.repositories.document_repository import DocumentRepository
from knowledge_chatbox_api.repositories.space_repository import SpaceRepository
from knowledge_chatbox_api.services.documents.constants import DEDUPLICABLE_DOCUMENT_STATUSES
from knowledge_chatbox_api.utils.document_types import guess_mime_type
from knowledge_chatbox_api.utils.files import PersistedUpload


@dataclass
class VersioningResult:
    """Return value for one upload versioning pass."""

    document: Document
    version: DocumentRevision
    duplicate_content: bool


class VersioningService:
    """Create document/version rows while leaving commit ownership to callers."""

    def __init__(self, session, settings: Settings) -> None:
        self.session = session
        self.settings = settings
        self.repository = DocumentRepository(session)
        self.space_repository = SpaceRepository(session)

    def create_document_version(
        self,
        *,
        actor: User,
        filename: str,
        upload_artifact: PersistedUpload,
        file_type: str,
    ) -> VersioningResult:
        """Create the next document version and flush ids without committing."""
        logical_name = Path(filename).name
        content_hash = upload_artifact.content_hash
        personal_space = self.space_repository.ensure_personal_space(user_id=actor.id)
        latest = self.repository.get_latest_by_logical_name(
            logical_name,
            space_id=personal_space.id,
        )

        latest_document = latest[0] if latest is not None else None
        latest_version = latest[1] if latest is not None else None
        duplicate_content = (
            latest_version is not None
            and latest_version.ingest_status in DEDUPLICABLE_DOCUMENT_STATUSES
            and latest_version.content_hash == content_hash
        )
        if duplicate_content and latest_document is not None and latest_version is not None:
            return VersioningResult(
                document=latest_document,
                version=latest_version,
                duplicate_content=True,
            )

        next_version = 1 if latest_version is None else latest_version.revision_no + 1

        if latest_document is None:
            document = Document(
                space_id=personal_space.id,
                title=filename,
                logical_name=logical_name,
                status=DocumentStatus.ACTIVE,
                current_version_number=1,
                latest_revision_id=None,
                created_by_user_id=actor.id,
                updated_by_user_id=actor.id,
            )
            self.repository.add(document)
        else:
            document = latest_document
            document.title = filename
            document.current_version_number = next_version
            document.updated_by_user_id = actor.id

        document_version = DocumentRevision(
            document_id=document.id,
            revision_no=next_version,
            source_filename=filename,
            mime_type=guess_mime_type(file_type),
            content_hash=content_hash,
            file_type=file_type,
            ingest_status=IngestStatus.UPLOADED,
            source_path=str(upload_artifact.path),
            file_size=upload_artifact.file_size,
            supersedes_revision_id=latest_version.id if latest_version is not None else None,
            created_by_user_id=actor.id,
            updated_by_user_id=actor.id,
        )
        self.repository.add_version(document_version)
        document.latest_revision_id = document_version.id

        return VersioningResult(
            document=document,
            version=document_version,
            duplicate_content=duplicate_content,
        )
