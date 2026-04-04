"""文档路由定义。"""

from __future__ import annotations

from pathlib import Path
from typing import Annotated, Literal

from fastapi import APIRouter, BackgroundTasks, File, Query, Response, UploadFile, status
from fastapi.responses import FileResponse

from knowledge_chatbox_api.api.deps import CurrentUserDep, DbSessionDep, SettingsDep
from knowledge_chatbox_api.api.error_responses import DOCUMENT_REINDEX_ERROR_RESPONSES
from knowledge_chatbox_api.core.logging import get_logger
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
    DocumentUploadFailedError,
    EmbeddingNotConfiguredError,
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


def _document_not_found() -> DocumentNotFoundError:
    return DocumentNotFoundError()


def to_document_revision_read(document_revision) -> DocumentRevisionRead:
    """把文档修订模型转换为修订响应结构。"""
    return DocumentRevisionRead(
        id=document_revision.id,
        document_id=document_revision.document_id,
        revision_no=document_revision.revision_no,
        source_filename=document_revision.source_filename,
        mime_type=document_revision.mime_type,
        file_type=document_revision.file_type,
        ingest_status=document_revision.ingest_status,
        content_hash=document_revision.content_hash,
        normalized_path=document_revision.normalized_path,
        source_path=document_revision.source_path,
        file_size=document_revision.file_size,
        chunk_count=document_revision.chunk_count,
        error_message=document_revision.error_message,
        supersedes_revision_id=document_revision.supersedes_revision_id,
        created_by_user_id=document_revision.created_by_user_id,
        updated_by_user_id=document_revision.updated_by_user_id,
        created_at=document_revision.created_at,
        updated_at=document_revision.updated_at,
        indexed_at=document_revision.indexed_at,
    )


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
        revision=to_document_revision_read(document_revision),
        latest_revision=to_document_revision_read(latest_revision),
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
            to_document_revision_read(latest_revision) if latest_revision is not None else None
        ),
        created_by_user_id=document.created_by_user_id,
        updated_by_user_id=document.updated_by_user_id,
        created_at=document.created_at,
        updated_at=document.updated_at,
    )


def to_document_upload_readiness_read(settings_record) -> DocumentUploadReadinessRead:
    """把上传 readiness 结果转换为响应结构。"""
    readiness = get_document_upload_readiness(settings_record)
    return DocumentUploadReadinessRead(
        can_upload=readiness.can_upload,
        image_fallback=readiness.image_fallback,
        blocking_reason=readiness.blocking_reason,
    )


def to_document_list_summary_read(*, pending_count: int) -> DocumentListSummaryRead:
    return DocumentListSummaryRead(pending_count=pending_count)


def ensure_document_upload_ready(settings_record) -> None:
    """上传前阻止缺少 embedding 配置的请求继续落盘。"""
    readiness = get_document_upload_readiness(settings_record)
    if readiness.blocking_reason == "pending_embedding_not_configured":
        raise PendingEmbeddingNotConfiguredError()
    if readiness.blocking_reason == "embedding_not_configured":
        raise EmbeddingNotConfiguredError()


@router.get("/upload-readiness", response_model=Envelope[DocumentUploadReadinessRead])
def get_document_upload_readiness_route(
    session: DbSessionDep,
    settings: SettingsDep,
    current_user: CurrentUserDep,
) -> Envelope[DocumentUploadReadinessRead]:
    """返回资源上传所需的最小配置是否就绪。"""
    del current_user
    ingestion_service = IngestionService(session, settings)
    settings_record = ingestion_service.settings_service.get_or_create_settings_record()
    return Envelope(
        success=True,
        data=to_document_upload_readiness_read(settings_record),
        error=None,
    )


@router.get("/summary", response_model=Envelope[DocumentListSummaryRead])
def get_document_list_summary(
    session: DbSessionDep,
    _settings: SettingsDep,
    current_user: CurrentUserDep,
) -> Envelope[DocumentListSummaryRead]:
    """返回资源列表的轻量摘要。"""
    service = DocumentQueryService(session)
    return Envelope(
        success=True,
        data=to_document_list_summary_read(
            pending_count=service.count_pending_documents(current_user)
        ),
        error=None,
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
    return Envelope(
        success=True,
        data=[to_document_summary_read(document, revision) for document, revision in documents],
        error=None,
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
        raise _document_not_found()
    latest_revision = repository.get_latest_revision(document)
    return Envelope(
        success=True,
        data=to_document_summary_read(document, latest_revision),
        error=None,
    )


@router.get("/{document_id}/revisions", response_model=Envelope[list[DocumentRevisionRead]])
def get_document_revisions(
    document_id: int,
    session: DbSessionDep,
    _settings: SettingsDep,
    current_user: CurrentUserDep,
) -> Envelope[list[DocumentRevisionRead]]:
    """获取文档Versions。"""
    service = DocumentQueryService(session)
    documents = service.list_versions(current_user, document_id)
    return Envelope(
        success=True,
        data=[to_document_revision_read(item) for item in documents],
        error=None,
    )


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
    """处理Upload文档相关逻辑。"""
    service = IngestionService(session, settings)
    repository = DocumentRepository(session)
    ensure_document_upload_ready(service.settings_service.get_or_create_settings_record())
    filename = file.filename or "upload.bin"
    content_type = file.content_type or "application/octet-stream"
    try:
        upload_artifact = await save_upload_stream(settings.upload_dir, filename, file)
        upload_result = service.upload_document(
            current_user,
            filename,
            upload_artifact,
            content_type,
        )
    except (UnsupportedFileTypeError, InvalidDocumentError):
        raise
    except Exception as exc:  # noqa: BLE001
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
    return Envelope(
        success=True,
        data=to_document_upload_read(
            upload_result.document,
            upload_result.revision,
            latest_revision,
            deduplicated=upload_result.deduplicated,
        ),
        error=None,
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
    """处理Reindex文档相关逻辑。"""
    service = IngestionService(session, settings)
    document = service.reindex_document(current_user, document_id)
    return Envelope(success=True, data=to_document_revision_read(document), error=None)


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
    return Envelope(success=True, data={"status": "ok"}, error=None)


@router.get("/{document_id}/file")
def get_document_file(
    document_id: int,
    session: DbSessionDep,
    _settings: SettingsDep,
    current_user: CurrentUserDep,
):
    """获取文档File。"""
    service = DocumentQueryService(session)
    document = service.get_document(current_user, document_id)
    if document is None:
        raise _document_not_found()

    document_revision = DocumentRepository(session).get_latest_revision(document)
    if document_revision is None:
        raise _document_not_found()

    file_path = Path(document_revision.origin_path)
    if not file_path.exists():
        raise DocumentFileNotFoundError()

    return FileResponse(path=file_path, filename=document_revision.file_name)


@router.get("/revisions/{revision_id}/file")
def get_document_revision_file(
    revision_id: int,
    session: DbSessionDep,
    _settings: SettingsDep,
    current_user: CurrentUserDep,
):
    """获取指定修订原文件。"""
    document_revision = DocumentQueryService(session).get_document_revision(
        current_user,
        revision_id,
    )
    if document_revision is None:
        raise _document_not_found()

    file_path = Path(document_revision.origin_path)
    if not file_path.exists():
        raise DocumentFileNotFoundError()

    return FileResponse(path=file_path, filename=document_revision.file_name)
