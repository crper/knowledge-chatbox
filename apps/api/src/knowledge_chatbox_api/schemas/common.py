"""Common Pydantic 模型定义。"""

from datetime import UTC, datetime

from pydantic import Field

from knowledge_chatbox_api.schemas import BaseSchema, ReadOnlySchema


class ErrorInfo(ReadOnlySchema):
    """错误信息响应体。"""

    code: str = Field(description="错误代码")
    message: str = Field(description="错误消息")
    details: object | None = Field(default=None, description="详细错误信息")


class HealthData(ReadOnlySchema):
    """健康检查响应体。"""

    status: str


class Envelope[T](BaseSchema):
    """定义统一接口响应包裹结构。

    用于标准化 API 响应，提供成功/错误两种状态。

    Attributes:
        success: 请求是否成功
        data: 成功时的数据载体
        error: 失败时的错误信息
        timestamp: 响应时间戳
    """

    success: bool
    data: T | None = None
    error: ErrorInfo | None = None
    timestamp: datetime = Field(default_factory=lambda: datetime.now(UTC))

    @classmethod
    def ok(cls, data: T) -> "Envelope[T]":
        """创建成功响应的便利方法。

        Args:
            data: 响应数据

        Returns:
            成功状态的 Envelope 实例
        """
        return cls(success=True, data=data, error=None)

    @classmethod
    def error_response(cls, error: ErrorInfo) -> "Envelope[T]":
        """创建错误响应的便利方法。

        Args:
            error: 错误信息

        Returns:
            错误状态的 Envelope 实例
        """
        return cls(success=False, data=None, error=error)
