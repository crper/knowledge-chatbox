"""共享应用异常模型。"""

from typing import Any

from knowledge_chatbox_api.schemas.common import ErrorInfo


class AppError(Exception):
    """带状态码与结构化错误码的应用异常基类。"""

    status_code: int = 400
    code: str = "app_error"
    default_message: str = "Application error."

    def __init__(
        self,
        message: str | None = None,
        *,
        details: Any | None = None,
        status_code: int | None = None,
        code: str | None = None,
    ) -> None:
        resolved_message = message or self.default_message
        super().__init__(resolved_message)
        self.message = resolved_message
        self.details = details
        if status_code is not None:
            self.status_code = status_code
        if code is not None:
            self.code = code

    def to_error_info(self) -> ErrorInfo:
        """转换为统一 API 错误结构。"""
        return ErrorInfo(code=self.code, message=self.message, details=self.details)
