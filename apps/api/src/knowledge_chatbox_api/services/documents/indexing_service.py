"""Chunk indexing logic for document revisions."""

from __future__ import annotations

from knowledge_chatbox_api.models.document import Document
from knowledge_chatbox_api.services.documents.chunking_service import Chunk, ChunkingService
from knowledge_chatbox_api.utils.chroma import ChunkStore


class IndexingService:
    """Build and persist searchable chunks for one document version."""

    def __init__(
        self,
        *,
        session,
        chunking_service: ChunkingService,
        chroma_store: ChunkStore,
        embedding_provider,
        settings,
        default_generation: int | None = None,
    ) -> None:
        self.session = session
        self.chunking_service = chunking_service
        self.chroma_store = chroma_store
        self.embedding_provider = embedding_provider
        self.settings = settings
        self.default_generation = (
            default_generation
            if default_generation is not None
            else getattr(settings, "active_index_generation", 1)
        )

    def _resolve_generation(self, generation: int | None) -> int:
        if generation is not None:
            return generation
        if self.default_generation is None:
            raise ValueError("generation is required for indexing.")
        return self.default_generation

    def index_document(
        self,
        document_version,
        content: str,
        *,
        generation: int | None = None,
        section_title: str | None = None,
        page_number: int | None = None,
    ) -> list[Chunk]:
        """Replace a document version's chunks without owning the transaction."""
        target_generation = self._resolve_generation(generation)
        self.chroma_store.delete_by_document_id(
            document_version.id,
            generation=target_generation,
        )
        chunks = self.chunking_service.chunk_text(
            document_id=document_version.id,
            content=content,
            section_title=section_title,
            page_number=page_number,
        )
        document = self.session.get(Document, document_version.document_id)
        logical_document_id = document.id if document is not None else None
        space_id = document.space_id if document is not None else None
        try:
            embeddings = self.embedding_provider.embed(
                [chunk.text for chunk in chunks],
                self.settings,
            )
        except Exception:  # noqa: BLE001
            embeddings = None
        self.chroma_store.upsert(
            [
                {
                    "id": chunk.chunk_id,
                    "document_id": logical_document_id,
                    "document_revision_id": document_version.id,
                    "space_id": space_id,
                    "text": chunk.text,
                    "metadata": chunk.metadata,
                }
                for chunk in chunks
            ],
            embeddings=embeddings,
            generation=target_generation,
        )
        document_version.chunk_count = len(chunks)
        return chunks

    def delete_document_chunks(self, document_version, *, generation: int | None = None) -> None:
        """Drop all indexed chunks for one document version without committing."""
        target_generation = self._resolve_generation(generation)
        self.chroma_store.delete_by_document_id(
            document_version.id,
            generation=target_generation,
        )
        document_version.chunk_count = 0
