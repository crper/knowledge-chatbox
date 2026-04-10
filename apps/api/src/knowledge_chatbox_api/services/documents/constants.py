"""文档相关服务模块。"""

from knowledge_chatbox_api.models.enums import IngestStatus

LISTABLE_DOCUMENT_STATUSES = tuple(m.value for m in IngestStatus)
DEDUPLICABLE_DOCUMENT_STATUSES = (
    IngestStatus.UPLOADED.value,
    IngestStatus.PROCESSING.value,
    IngestStatus.INDEXED.value,
)
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
