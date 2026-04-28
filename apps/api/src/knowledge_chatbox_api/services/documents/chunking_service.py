from __future__ import annotations

from chonkie import RecursiveChunker
from pydantic import BaseModel


class ChunkMetadata(BaseModel):
    """文档分块元数据。"""

    document_id: int
    chunk_id: str
    chunk_index: int
    section_title: str | None = None
    page_number: int | None = None


class Chunk(BaseModel):
    """文档分块结果。"""

    chunk_id: str
    chunk_index: int
    text: str
    metadata: ChunkMetadata


_DEFAULT_CHUNK_SIZE = 512


class ChunkingService:
    """基于markdown语法结构的文档分块服务。"""

    def __init__(
        self,
        *,
        chunk_size: int = _DEFAULT_CHUNK_SIZE,
    ) -> None:
        self._chunker = RecursiveChunker.from_recipe(
            "markdown",
            chunk_size=chunk_size,
        )

    def chunk_text(
        self,
        *,
        document_id: int,
        content: str,
        section_title: str | None = None,
        page_number: int | None = None,
    ) -> list[Chunk]:
        """将文档内容分块为语义单元。

        使用 RecursiveChunker 按 markdown 语法结构递归切分文本，
        确保每个块不超过配置的 chunk_size 个 token。

        Args:
            document_id: 文档ID，用于生成chunk_id
            content: 待分块的原始文本
            section_title: 可选的章节标题，会注入到元数据中
            page_number: 可选的页码，会注入到元数据中

        Returns:
            分块后的 Chunk 列表，每个 Chunk 包含 id、索引、文本和元数据

        Raises:
            无显式异常，空内容返回空列表
        """
        if not content.strip():
            return []

        chonkie_chunks = self._chunker.chunk(content)
        chunks: list[Chunk] = []

        for idx, chonkie_chunk in enumerate(chonkie_chunks):
            chunk_id = f"{document_id}:{idx}"
            chunks.append(
                Chunk(
                    chunk_id=chunk_id,
                    chunk_index=idx,
                    text=chonkie_chunk.text,
                    metadata=ChunkMetadata(
                        document_id=document_id,
                        chunk_id=chunk_id,
                        chunk_index=idx,
                        section_title=section_title,
                        page_number=page_number,
                    ),
                )
            )

        return chunks


_default_chunking_service = ChunkingService()


def get_default_chunking_service() -> ChunkingService:
    return _default_chunking_service
