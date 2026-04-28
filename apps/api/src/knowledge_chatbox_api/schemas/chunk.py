"""Chunk 存储与检索的 Pydantic 模型定义。

本模块定义 ChromaDB 存储层、索引服务、检索服务共用的 chunk 记录类型，
替代之前分散在各处的 dict[str, Any] 数据传递模式。
"""

from typing import Any

from pydantic import BaseModel, ConfigDict, Field

__all__ = [
    "ChromaWhereFilter",
    "ChunkRecordMetadata",
    "ChunkStoreRecord",
]

ChromaWhereFilter = dict[str, Any]
"""ChromaDB where 过滤条件的类型别名。

ChromaDB 的 where 条件是递归嵌套结构（$and/$or 可嵌套），
键名为动态字段名，值为多态（int/str/dict with $in 等），
不适合用 Pydantic 模型严格建模，使用类型别名提供语义化文档。
"""


class ChunkRecordMetadata(BaseModel):
    """Chunk 记录的展示元数据。"""

    model_config = ConfigDict(extra="allow")

    section_title: str | None = None
    page_number: int | None = None


class ChunkStoreRecord(BaseModel):
    """ChromaDB 存储与检索的统一 chunk 记录类型。

    替代之前在 indexing_service、chroma_store、retrieval_chunk_repository
    和 querying 模块中使用的 dict[str, Any] 数据传递模式。

    extra='allow' 确保 ChromaDB 返回的额外字段不会导致验证失败。
    """

    model_config = ConfigDict(extra="allow")

    id: str
    document_id: int | None = None
    document_revision_id: int
    space_id: int | None = None
    text: str = ""
    metadata: ChunkRecordMetadata = Field(default_factory=ChunkRecordMetadata)
    score: float | None = None
    embedding: list[float] | None = None
