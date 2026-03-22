"""文档相关服务模块。"""

from __future__ import annotations

from dataclasses import dataclass


@dataclass
class Chunk:
    """封装切块。"""

    chunk_id: str
    chunk_index: int
    text: str
    metadata: dict


class ChunkingService:
    """封装文本切块逻辑。"""

    def __init__(self, max_chunk_length: int = 800, overlap: int = 120) -> None:
        self.max_chunk_length = max_chunk_length
        self.overlap = overlap

    def chunk_text(
        self,
        *,
        document_id: int,
        content: str,
        section_title: str | None = None,
        page_number: int | None = None,
    ) -> list[Chunk]:
        """处理切块Text相关逻辑。"""
        paragraphs = [part.strip() for part in content.split("\n\n") if part.strip()]
        chunks: list[Chunk] = []
        chunk_index = 0

        for paragraph in paragraphs:
            for text in self._split_paragraph(paragraph):
                chunks.append(
                    Chunk(
                        chunk_id=f"{document_id}:{chunk_index}",
                        chunk_index=chunk_index,
                        text=text,
                        metadata={
                            "document_id": document_id,
                            "chunk_id": f"{document_id}:{chunk_index}",
                            "chunk_index": chunk_index,
                            "section_title": section_title,
                            "page_number": page_number,
                        },
                    )
                )
                chunk_index += 1

        return chunks

    def _split_paragraph(self, paragraph: str) -> list[str]:
        if len(paragraph) <= self.max_chunk_length:
            return [paragraph]

        parts: list[str] = []
        start = 0
        while start < len(paragraph):
            end = min(start + self.max_chunk_length, len(paragraph))
            parts.append(paragraph[start:end])
            if end >= len(paragraph):
                break
            start = max(0, end - self.overlap)
        return parts
