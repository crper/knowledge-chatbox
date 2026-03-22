"""文档相关服务模块。"""

from __future__ import annotations

from knowledge_chatbox_api.core.errors import AppError


class DocumentError(AppError):
    """文档域异常基类。"""

    status_code = 400
    code = "document_error"
    default_message = "Document operation failed."


class UnsupportedFileTypeError(DocumentError):
    """封装UnsupportedFileType异常。"""

    code = "unsupported_file_type"
    default_message = "Unsupported file type."

    def __init__(self, message: str = "Unsupported file type.") -> None:
        super().__init__(message)


class InvalidDocumentError(DocumentError):
    """封装非法文档异常。"""

    code = "invalid_document"
    default_message = "Invalid or corrupted document."

    def __init__(self, message: str = "Invalid or corrupted document.") -> None:
        super().__init__(message)


class DocumentNotFoundError(DocumentError):
    """文档不存在。"""

    status_code = 404
    code = "document_not_found"
    default_message = "Document not found."


class DocumentFileNotFoundError(DocumentError):
    """文档原文件不存在。"""

    status_code = 404
    code = "document_file_not_found"
    default_message = "Document file not found."


class DocumentNotNormalizedError(DocumentError):
    """文档尚未完成标准化，无法执行依赖标准化结果的操作。"""

    status_code = 409
    code = "document_not_normalized"
    default_message = "Document has not been normalized yet."


class DocumentUploadFailedError(DocumentError):
    """文档上传出现未预期失败。"""

    status_code = 500
    code = "document_upload_failed"
    default_message = "Document upload failed."
