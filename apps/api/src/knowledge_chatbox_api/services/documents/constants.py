"""文档相关服务模块。"""

from __future__ import annotations

VISIBLE_DOCUMENT_STATUSES = ("uploaded", "processing", "indexed")
TEXT_DOCUMENT_FILE_TYPES = frozenset({"txt"})
MARKDOWN_DOCUMENT_FILE_TYPES = frozenset({"md"})
DOCX_DOCUMENT_FILE_TYPES = frozenset({"docx"})
IMAGE_DOCUMENT_FILE_TYPES = frozenset({"png", "jpg", "jpeg", "webp"})

SUPPORTED_DOCUMENT_FILE_TYPES = frozenset(
    {
        *TEXT_DOCUMENT_FILE_TYPES,
        *MARKDOWN_DOCUMENT_FILE_TYPES,
        "pdf",
        *DOCX_DOCUMENT_FILE_TYPES,
        *IMAGE_DOCUMENT_FILE_TYPES,
    }
)

CONTENT_TYPE_TO_FILE_TYPE = {
    "text/plain": "txt",
    "text/markdown": "md",
    "application/pdf": "pdf",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "docx",
    "image/png": "png",
    "image/jpeg": "jpg",
    "image/webp": "webp",
}
