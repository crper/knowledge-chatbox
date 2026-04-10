"""Common Pydantic 模型定义。"""

from typing import Any

from pydantic import BaseModel


class ErrorInfo(BaseModel):
    code: str
    message: str
    details: Any | None = None


class Envelope[T](BaseModel):
    """定义统一接口响应包裹结构。"""

    success: bool
    data: T | None = None
    error: ErrorInfo | None = None
