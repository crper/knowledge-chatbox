"""结构化日志统一观测字段定义。"""

from __future__ import annotations

from pydantic import BaseModel, ConfigDict

from knowledge_chatbox_api.models.enums import OperationKind

OPERATION_KIND_CHAT_STREAM = OperationKind.CHAT_STREAM
OPERATION_KIND_CHAT_SYNC = OperationKind.CHAT_SYNC
OPERATION_KIND_DOCUMENT_UPLOAD = OperationKind.DOCUMENT_UPLOAD
OPERATION_KIND_DOCUMENT_BACKGROUND_INGESTION = OperationKind.DOCUMENT_BACKGROUND_INGESTION
OPERATION_KIND_INDEX_REBUILD = OperationKind.INDEX_REBUILD
OPERATION_KIND_COMPENSATION = OperationKind.COMPENSATION


class ObservationFields(BaseModel):
    """统一观测字段定义，用于日志记录的标准化字段集合。

    Attributes:
        request_id: HTTP 请求关联的唯一标识符（由 CorrelationIdMiddleware 自动生成）
        operation_kind: 操作类型，用于区分不同业务操作
        session_id: 聊天会话 ID
        run_id: 聊天运行 ID
        document_revision_id: 文档版本 ID
        provider: 当前使用的 LLM provider 名称
        model: 当前使用的 LLM 模型名称
        generation: 当前索引 generation 版本号
    """

    model_config = ConfigDict(frozen=True)

    request_id: str | None = None
    operation_kind: OperationKind | None = None
    session_id: int | None = None
    run_id: int | None = None
    document_revision_id: int | None = None
    provider: str | None = None
    model: str | None = None
    generation: int | None = None

    def to_dict(self) -> dict[str, object]:
        """返回非 None 字段的字典，用于结构化日志绑定。"""
        return {k: v for k, v in self.model_dump().items() if v is not None}

    @classmethod
    def from_run_context(
        cls,
        *,
        session_id: int,
        run_id: int,
        provider: str,
        model: str,
        generation: int,
    ) -> ObservationFields:
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
        document_revision_id: int,
        provider: str,
        model: str,
        generation: int,
    ) -> ObservationFields:
        """从文档处理上下文创建观测字段。"""
        return cls(
            document_revision_id=document_revision_id,
            provider=provider,
            model=model,
            generation=generation,
        )
