"""文档数据模型定义。"""

from __future__ import annotations

from datetime import datetime

from sqlalchemy import CheckConstraint, DateTime, ForeignKey, Index, Integer, String, Text, func
from sqlalchemy.orm import Mapped, mapped_column, synonym

from knowledge_chatbox_api.db.base import Base


class Document(Base):
    """逻辑文档主表。"""

    __tablename__ = "documents"
    __table_args__ = (
        CheckConstraint("status IN ('active', 'archived')", name="ck_documents_status"),
        Index(
            "uq_documents_space_logical_name",
            "space_id",
            "logical_name",
            unique=True,
        ),
        Index(
            "ix_documents_space_updated",
            "space_id",
            "updated_at",
            "id",
        ),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    space_id: Mapped[int] = mapped_column(
        ForeignKey("spaces.id", ondelete="CASCADE"), nullable=False
    )
    title: Mapped[str] = mapped_column(String(255), nullable=False)
    logical_name: Mapped[str] = mapped_column(String(255), nullable=False)
    status: Mapped[str] = mapped_column(String(16), nullable=False, default="active")
    current_version_number: Mapped[int] = mapped_column(Integer, nullable=False, default=1)
    latest_revision_id: Mapped[int | None] = mapped_column(Integer)
    created_by_user_id: Mapped[int | None] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL")
    )
    updated_by_user_id: Mapped[int | None] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL")
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False
    )

    knowledge_base_id = synonym("space_id")
    name = synonym("title")


class DocumentRevision(Base):
    """文档修订表。"""

    __tablename__ = "document_revisions"
    __table_args__ = (
        CheckConstraint(
            "ingest_status IN ('uploaded', 'processing', 'indexed', 'failed')",
            name="ck_document_revisions_ingest_status",
        ),
        Index(
            "uq_document_revisions_document_revision_no",
            "document_id",
            "revision_no",
            unique=True,
        ),
        Index(
            "ix_document_revisions_document_revision_no",
            "document_id",
            "revision_no",
        ),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    document_id: Mapped[int] = mapped_column(
        ForeignKey("documents.id", ondelete="CASCADE"), nullable=False
    )
    revision_no: Mapped[int] = mapped_column(Integer, nullable=False)
    source_filename: Mapped[str] = mapped_column(String(255), nullable=False)
    mime_type: Mapped[str] = mapped_column(String(255), nullable=False)
    content_hash: Mapped[str] = mapped_column(String(128), nullable=False)
    file_type: Mapped[str] = mapped_column(String(32), nullable=False)
    ingest_status: Mapped[str] = mapped_column(String(16), nullable=False)
    source_path: Mapped[str] = mapped_column(String(512), nullable=False)
    normalized_path: Mapped[str | None] = mapped_column(String(512))
    file_size: Mapped[int | None] = mapped_column(Integer)
    chunk_count: Mapped[int | None] = mapped_column(Integer)
    error_message: Mapped[str | None] = mapped_column(Text)
    supersedes_revision_id: Mapped[int | None] = mapped_column(
        ForeignKey("document_revisions.id", ondelete="SET NULL")
    )
    indexed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    created_by_user_id: Mapped[int | None] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL")
    )
    updated_by_user_id: Mapped[int | None] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL")
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False
    )

    version_number = synonym("revision_no")
    file_name = synonym("source_filename")
    lifecycle_status = synonym("ingest_status")
    origin_path = synonym("source_path")
    supersedes_version_id = synonym("supersedes_revision_id")

    def __init__(self, **kwargs) -> None:
        if kwargs.get("mime_type") is None:
            file_type = kwargs.get("file_type")
            mime_types = {
                "txt": "text/plain",
                "md": "text/markdown",
                "markdown": "text/markdown",
                "pdf": "application/pdf",
                "docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
                "png": "image/png",
                "jpg": "image/jpeg",
                "jpeg": "image/jpeg",
                "webp": "image/webp",
            }
            kwargs["mime_type"] = (
                mime_types.get(file_type, "application/octet-stream")
                if isinstance(file_type, str)
                else "application/octet-stream"
            )
        super().__init__(**kwargs)
