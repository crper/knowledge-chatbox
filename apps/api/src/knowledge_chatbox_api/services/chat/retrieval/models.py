from pydantic import BaseModel, ConfigDict, Field

from knowledge_chatbox_api.schemas.chunk import ChunkStoreRecord
from knowledge_chatbox_api.services.chat.workflow.output import WorkflowSource

MIN_RETRIEVAL_SOURCE_SCORE = 0.45
ATTACHMENT_SCOPED_QUERY_MULTIPLIER = 3

RetrievedChunkRecord = ChunkStoreRecord


class RetrievalDiagnostics(BaseModel):
    """检索诊断信息，用于 prompt 组装日志。"""

    model_config = ConfigDict(frozen=True)

    strategy: str = "none"
    latency_ms: int = 0
    candidate_count: int = 0
    attachment_revision_scope_count: int = 0


class RetrievedContext(BaseModel):
    """检索结果上下文，用于 prompt 组装。"""

    model_config = ConfigDict(frozen=True)

    context_sections: list[str] = Field(default_factory=list)
    sources: list[WorkflowSource] = Field(default_factory=list)
    diagnostics: RetrievalDiagnostics = Field(default_factory=RetrievalDiagnostics)
