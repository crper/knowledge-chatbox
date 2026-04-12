from __future__ import annotations

from dataclasses import dataclass

from chonkie import RecursiveChunker


@dataclass
class Chunk:
    chunk_id: str
    chunk_index: int
    text: str
    metadata: dict[str, int | str | None]


_DEFAULT_CHUNK_SIZE = 512


class ChunkingService:
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
                    metadata=_build_chunk_metadata(
                        document_id, chunk_id, idx, section_title, page_number
                    ),
                )
            )

        return chunks


def _build_chunk_metadata(
    document_id: int,
    chunk_id: str,
    chunk_index: int,
    section_title: str | None,
    page_number: int | None,
) -> dict[str, int | str | None]:
    return {
        "document_id": document_id,
        "chunk_id": chunk_id,
        "chunk_index": chunk_index,
        "section_title": section_title,
        "page_number": page_number,
    }


_default_chunking_service = ChunkingService()


def get_default_chunking_service() -> ChunkingService:
    return _default_chunking_service
