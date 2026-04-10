"""文档 Pydantic 模型定义。"""

from datetime import datetime

from pydantic import BaseModel


class DocumentRevisionRead(BaseModel):
    """描述文档修订响应体。"""

    id: int
    document_id: int
    revision_no: int
    source_filename: str
    mime_type: str
    file_type: str
    ingest_status: str
    content_hash: str
    normalized_path: str | None
    source_path: str
    file_size: int | None
    chunk_count: int | None
    error_message: str | None
    supersedes_revision_id: int | None
    created_by_user_id: int | None
    updated_by_user_id: int | None
    created_at: datetime
    updated_at: datetime
    indexed_at: datetime | None


class DocumentSummaryRead(BaseModel):
    """描述逻辑文档响应体。"""

    id: int
    space_id: int
    title: str
    logical_name: str
    status: str
    latest_revision: DocumentRevisionRead | None = None
    created_by_user_id: int | None
    updated_by_user_id: int | None
    created_at: datetime
    updated_at: datetime


class DocumentUploadRead(BaseModel):
    """描述上传接口响应体。"""

    deduplicated: bool = False
    document: DocumentSummaryRead
    revision: DocumentRevisionRead
    latest_revision: DocumentRevisionRead


class DocumentUploadReadinessRead(BaseModel):
    """描述资源上传前置条件是否满足。"""

    can_upload: bool
    image_fallback: bool
    blocking_reason: str | None


class DocumentListSummaryRead(BaseModel):
    """描述资源列表的轻量摘要。"""

    pending_count: int
