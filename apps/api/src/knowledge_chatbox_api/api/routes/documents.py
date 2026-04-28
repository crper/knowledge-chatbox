"""文档路由定义。"""

from pathlib import Path
from typing import Annotated, Literal

from fastapi import APIRouter, BackgroundTasks, File, Query, Response, UploadFile, status
from fastapi.responses import FileResponse

from knowledge_chatbox_api.api.deps import CurrentUserDep, DbSessionDep, SettingsDep
from knowledge_chatbox_api.api.error_responses import DOCUMENT_REINDEX_ERROR_RESPONSES
from knowledge_chatbox_api.core.logging import get_logger
from knowledge_chatbox_api.models.enums import IngestStatus
from knowledge_chatbox_api.repositories.document_repository import DocumentRepository
from knowledge_chatbox_api.schemas.common import Envelope
from knowledge_chatbox_api.schemas.document import (
    DocumentListSummaryRead,
    DocumentRevisionRead,
    DocumentSummaryRead,
    DocumentUploadRead,
    DocumentUploadReadinessRead,
)
from knowledge_chatbox_api.services.documents.constants import IMAGE_DOCUMENT_FILE_TYPES
from knowledge_chatbox_api.services.documents.errors import (
    DocumentFileNotFoundError,
    DocumentNotFoundError,
    DocumentReindexFailedError,
    DocumentUploadFailedError,
    EmbeddingNotConfiguredError,
    FileTooLargeError,
    InvalidDocumentError,
    PendingEmbeddingNotConfiguredError,
    UnsupportedFileTypeError,
)
from knowledge_chatbox_api.services.documents.ingestion_service import IngestionService
from knowledge_chatbox_api.services.documents.query_service import DocumentQueryService
from knowledge_chatbox_api.services.documents.upload_readiness import get_document_upload_readiness
from knowledge_chatbox_api.tasks import document_jobs
from knowledge_chatbox_api.utils.files import save_upload_stream

router = APIRouter(prefix="/api/documents", tags=["documents"])
UploadFileDep = Annotated[UploadFile, File(...)]
logger = get_logger(__name__)
DocumentListTypeFilter = Literal["document", "image", "markdown", "pdf", "text"]
DocumentListStatusFilter = Literal["uploaded", "processing", "indexed", "failed"]
DOCUMENT_TYPE_QUERY = Query(default=None, alias="type")
DOCUMENT_STATUS_QUERY = Query(default=None, alias="status")


def _safe_file_path(file_path: Path, allowed_dirs: list[Path]) -> Path:
    """确保文件路径在允许的存储目录内，防止路径遍历攻击。"""
    resolved = file_path.resolve()
    for allowed_dir in allowed_dirs:
        if resolved.is_relative_to(allowed_dir.resolve()):
            return resolved
    raise DocumentFileNotFoundError()


def to_document_upload_read(
    document,
    document_revision,
    latest_revision,
    *,
    deduplicated: bool,
) -> DocumentUploadRead:
    """把上传结果转换为资源响应结构。"""
    return DocumentUploadRead(
        deduplicated=deduplicated,
        document=to_document_summary_read(document, latest_revision),
        revision=DocumentRevisionRead.model_validate(document_revision),
        latest_revision=DocumentRevisionRead.model_validate(latest_revision),
    )


def to_document_summary_read(document, latest_revision) -> DocumentSummaryRead:
    """把逻辑文档模型转换为文档响应结构。"""
    return DocumentSummaryRead(
        id=document.id,
        space_id=document.space_id,
        title=document.title,
        logical_name=document.logical_name,
        status=document.status,
        latest_revision=(
            DocumentRevisionRead.model_validate(latest_revision)
            if latest_revision is not None
            else None
        ),
        created_by_user_id=document.created_by_user_id,
        updated_by_user_id=document.updated_by_user_id,
        created_at=document.created_at,
        updated_at=document.updated_at,
    )


def to_document_upload_readiness_read(settings_record) -> DocumentUploadReadinessRead:
    """把上传就绪状态转换为响应结构。"""
    readiness = get_document_upload_readiness(settings_record)
    return DocumentUploadReadinessRead(
        can_upload=readiness.can_upload,
        image_fallback=readiness.image_fallback,
        blocking_reason=readiness.blocking_reason,
    )


def ensure_document_upload_ready(settings_record) -> None:
    """上传前阻止缺少向量配置的请求继续落盘。"""
    readiness = get_document_upload_readiness(settings_record)
    if readiness.blocking_reason == "pending_embedding_not_configured":
        raise PendingEmbeddingNotConfiguredError()
    if readiness.blocking_reason == "embedding_not_configured":
        raise EmbeddingNotConfiguredError()


@router.get("/upload-readiness", response_model=Envelope[DocumentUploadReadinessRead])
def get_document_upload_readiness_route(
    session: DbSessionDep,
    settings: SettingsDep,
    _current_user: CurrentUserDep,
) -> Envelope[DocumentUploadReadinessRead]:
    """返回资源上传所需的最小配置是否就绪。"""
    ingestion_service = IngestionService(session, settings)
    settings_record = ingestion_service.settings_service.get_or_create_settings_record()
    return Envelope.ok(to_document_upload_readiness_read(settings_record))


@router.get("/summary", response_model=Envelope[DocumentListSummaryRead])
def get_document_list_summary(
    session: DbSessionDep,
    _settings: SettingsDep,
    current_user: CurrentUserDep,
) -> Envelope[DocumentListSummaryRead]:
    """返回资源列表的轻量摘要。"""
    service = DocumentQueryService(session)
    return Envelope.ok(
        DocumentListSummaryRead(pending_count=service.count_pending_documents(current_user))
    )


@router.get("", response_model=Envelope[list[DocumentSummaryRead]])
def list_documents(
    session: DbSessionDep,
    _settings: SettingsDep,
    current_user: CurrentUserDep,
    query: str | None = Query(default=None),
    type_filter: DocumentListTypeFilter | None = DOCUMENT_TYPE_QUERY,
    status_filter: DocumentListStatusFilter | None = DOCUMENT_STATUS_QUERY,
) -> Envelope[list[DocumentSummaryRead]]:
    """列出文档。"""
    service = DocumentQueryService(session)
    documents = service.list_documents(
        current_user,
        ingest_status=status_filter,
        query=query,
        type_filter=type_filter,
    )
    return Envelope.ok(
        [to_document_summary_read(document, revision) for document, revision in documents]
    )


@router.get("/{document_id}", response_model=Envelope[DocumentSummaryRead])
def get_document(
    document_id: int,
    session: DbSessionDep,
    _settings: SettingsDep,
    current_user: CurrentUserDep,
) -> Envelope[DocumentSummaryRead]:
    """获取文档。"""
    service = DocumentQueryService(session)
    repository = DocumentRepository(session)
    document = service.get_document(current_user, document_id)
    if document is None:
        raise DocumentNotFoundError()
    latest_revision = repository.get_latest_revision(document)
    return Envelope.ok(to_document_summary_read(document, latest_revision))


@router.get("/{document_id}/revisions", response_model=Envelope[list[DocumentRevisionRead]])
def get_document_revisions(
    document_id: int,
    session: DbSessionDep,
    _settings: SettingsDep,
    current_user: CurrentUserDep,
) -> Envelope[list[DocumentRevisionRead]]:
    """获取文档版本列表。"""
    service = DocumentQueryService(session)
    documents = service.list_versions(current_user, document_id)
    return Envelope.ok([DocumentRevisionRead.model_validate(item) for item in documents])


@router.post(
    "/upload",
    response_model=Envelope[DocumentUploadRead],
    responses={
        status.HTTP_200_OK: {"description": "Existing document revision reused."},
        status.HTTP_202_ACCEPTED: {"description": "Image accepted for background ingestion."},
    },
    status_code=status.HTTP_201_CREATED,
)
async def upload_document(
    response: Response,
    session: DbSessionDep,
    settings: SettingsDep,
    current_user: CurrentUserDep,
    background_tasks: BackgroundTasks,
    file: UploadFileDep,
) -> Envelope[DocumentUploadRead]:
    """上传文档。"""
    service = IngestionService(session, settings)
    repository = DocumentRepository(session)
    ensure_document_upload_ready(service.settings_service.get_or_create_settings_record())
    filename = file.filename or "upload.bin"
    content_type = file.content_type or "application/octet-stream"
    max_bytes = settings.max_upload_size_mb * 1024 * 1024
    try:
        upload_artifact = await save_upload_stream(
            settings.upload_dir,
            filename,
            file,
            size_limit=max_bytes,
        )
        upload_result = service.upload_document(
            current_user,
            filename,
            upload_artifact,
            content_type,
        )
    except ValueError:
        raise FileTooLargeError(settings.max_upload_size_mb) from None
    except (UnsupportedFileTypeError, InvalidDocumentError):
        raise
    except Exception as exc:
        logger.exception(
            "Document upload failed unexpectedly",
            filename=filename,
            content_type=content_type,
        )
        raise DocumentUploadFailedError() from exc
    finally:
        await file.close()
    if upload_result.background_processing:
        background_tasks.add_task(
            document_jobs.complete_document_ingestion,
            settings,
            upload_result.revision.id,
        )

    if upload_result.deduplicated:
        response.status_code = status.HTTP_200_OK
    elif upload_result.revision.file_type in IMAGE_DOCUMENT_FILE_TYPES:
        response.status_code = status.HTTP_202_ACCEPTED
    else:
        response.status_code = status.HTTP_201_CREATED
    latest_revision = repository.get_latest_revision(upload_result.document)
    return Envelope.ok(
        to_document_upload_read(
            upload_result.document,
            upload_result.revision,
            latest_revision,
            deduplicated=upload_result.deduplicated,
        ),
    )


@router.post(
    "/{document_id}/reindex",
    response_model=Envelope[DocumentRevisionRead],
    responses=DOCUMENT_REINDEX_ERROR_RESPONSES,
)
def reindex_document(
    document_id: int,
    session: DbSessionDep,
    settings: SettingsDep,
    current_user: CurrentUserDep,
) -> Envelope[DocumentRevisionRead]:
    """重新索引文档。"""
    service = IngestionService(session, settings)
    document = service.reindex_document(current_user, document_id)
    if document.ingest_status == IngestStatus.FAILED:
        raise DocumentReindexFailedError(document.error_message)
    return Envelope.ok(DocumentRevisionRead.model_validate(document))


@router.delete("/{document_id}", response_model=Envelope[dict[str, str]])
def delete_document(
    document_id: int,
    session: DbSessionDep,
    settings: SettingsDep,
    current_user: CurrentUserDep,
) -> Envelope[dict[str, str]]:
    """删除文档。"""
    service = IngestionService(session, settings)
    service.delete_document(current_user, document_id)
    return Envelope.ok({"status": "ok"})


@router.get("/{document_id}/file")
def get_document_file(
    document_id: int,
    session: DbSessionDep,
    settings: SettingsDep,
    current_user: CurrentUserDep,
):
    """获取文档原文件。"""
    service = DocumentQueryService(session)
    document = service.get_document(current_user, document_id)
    if document is None:
        raise DocumentNotFoundError()

    document_revision = DocumentRepository(session).get_latest_revision(document)
    if document_revision is None:
        raise DocumentNotFoundError()

    file_path = _safe_file_path(
        Path(document_revision.origin_path),
        [settings.upload_dir, settings.normalized_dir],
    )
    try:
        return FileResponse(path=file_path, filename=document_revision.source_filename)
    except FileNotFoundError:
        raise DocumentFileNotFoundError() from None


@router.get("/revisions/{revision_id}/file")
def get_document_revision_file(
    revision_id: int,
    session: DbSessionDep,
    settings: SettingsDep,
    current_user: CurrentUserDep,
):
    """获取指定修订原文件。"""
    document_revision = DocumentQueryService(session).get_document_revision(
        current_user,
        revision_id,
    )
    if document_revision is None:
        raise DocumentNotFoundError()

    file_path = _safe_file_path(
        Path(document_revision.origin_path),
        [settings.upload_dir, settings.normalized_dir],
    )
    try:
        return FileResponse(path=file_path, filename=document_revision.source_filename)
    except FileNotFoundError:
        raise DocumentFileNotFoundError() from None
