"""CommonPydantic 模型定义。"""

from __future__ import annotations

from typing import Any

from pydantic import BaseModel


class AppErrorPayload(BaseModel):
    """定义统一错误载荷。"""

    code: str
    message: str
    details: Any | None = None


class ErrorInfo(AppErrorPayload):
    """定义异常Info数据结构。"""


class Envelope[T](BaseModel):
    """定义统一接口响应包裹结构。"""

    success: bool
    data: T | None = None
    error: ErrorInfo | None = None
