"""文档相关领域常量。"""

from knowledge_chatbox_api.models.enums import IngestStatus

DOCX_DOCUMENT_FILE_TYPES = frozenset({"docx"})
IMAGE_DOCUMENT_FILE_TYPES = frozenset({"png", "jpg", "jpeg", "webp"})
MARKDOWN_DOCUMENT_FILE_TYPES = frozenset({"md"})
TEXT_DOCUMENT_FILE_TYPES = frozenset({"txt"})

LISTABLE_DOCUMENT_STATUSES = tuple(m.value for m in IngestStatus)
DEDUPLICABLE_DOCUMENT_STATUSES = (
    IngestStatus.UPLOADED,
    IngestStatus.PROCESSING,
    IngestStatus.INDEXED,
)

SUPPORTED_DOCUMENT_FILE_TYPES = frozenset(
    {
        *TEXT_DOCUMENT_FILE_TYPES,
        *MARKDOWN_DOCUMENT_FILE_TYPES,
        "pdf",
        *DOCX_DOCUMENT_FILE_TYPES,
        *IMAGE_DOCUMENT_FILE_TYPES,
    }
)
