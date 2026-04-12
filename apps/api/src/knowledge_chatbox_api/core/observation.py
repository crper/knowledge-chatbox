"""结构化日志统一观测字段定义。"""

from dataclasses import dataclass, fields
from typing import Any


@dataclass(frozen=True)
class ObservationFields:
    """统一观测字段定义，用于日志记录的标准化字段集合。

    Attributes:
        request_id: HTTP 请求关联的唯一标识符（由 CorrelationIdMiddleware 自动生成）
        operation_kind: 操作类型，用于区分不同业务操作（如 chat_stream、chat_sync 等）
        session_id: 聊天会话 ID
        run_id: 聊天运行 ID
        document_revision_id: 文档版本 ID
        provider: 当前使用的 LLM provider 名称
        model: 当前使用的 LLM 模型名称
        generation: 当前索引 generation 版本号
    """

    request_id: str | None = None
    operation_kind: str | None = None
    session_id: int | None = None
    run_id: int | None = None
    document_revision_id: int | None = None
    provider: str | None = None
    model: str | None = None
    generation: int | None = None

    def to_dict(self) -> dict[str, Any]:
        """将非 None 字段转换为字典，用于日志记录。"""
        return {
            field.name: getattr(self, field.name)
            for field in fields(self)
            if getattr(self, field.name) is not None
        }

    @classmethod
    def from_run_context(
        cls,
        *,
        session_id: int | None = None,
        run_id: int | None = None,
        provider: str | None = None,
        model: str | None = None,
        generation: int | None = None,
    ) -> "ObservationFields":
        """从聊天运行上下文创建观测字段。"""
        return cls(
            session_id=session_id,
            run_id=run_id,
            provider=provider,
            model=model,
            generation=generation,
        )

    @classmethod
    def from_document_context(
        cls,
        *,
        document_revision_id: int | None = None,
        provider: str | None = None,
        model: str | None = None,
        generation: int | None = None,
    ) -> "ObservationFields":
        """从文档处理上下文创建观测字段。"""
        return cls(
            document_revision_id=document_revision_id,
            provider=provider,
            model=model,
            generation=generation,
        )


OPERATION_KIND_CHAT_STREAM = "chat_stream"
OPERATION_KIND_CHAT_SYNC = "chat_sync"
OPERATION_KIND_DOCUMENT_UPLOAD = "document_upload"
OPERATION_KIND_DOCUMENT_BACKGROUND_INGESTION = "document_background_ingestion"
OPERATION_KIND_INDEX_REBUILD = "index_rebuild"
OPERATION_KIND_COMPENSATION = "compensation"
