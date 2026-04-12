"""Chunk indexing logic for document revisions."""

from typing import Any

from knowledge_chatbox_api.core.logging import get_logger
from knowledge_chatbox_api.models.document import Document
from knowledge_chatbox_api.repositories.retrieval_chunk_repository import RetrievalChunkRepository
from knowledge_chatbox_api.services.documents.chunking_service import Chunk, ChunkingService
from knowledge_chatbox_api.services.documents.errors import DocumentNotNormalizedError
from knowledge_chatbox_api.utils.chroma import ChunkStore

logger = get_logger(__name__)


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
        self.retrieval_chunk_repository = RetrievalChunkRepository(session)
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
        document: Document | None = self.session.get(Document, document_version.document_id)
        logical_document_id: int | None = document.id if document is not None else None
        space_id: int | None = document.space_id if document is not None else None
        try:
            embeddings: list[list[float]] = self.embedding_provider.embed(
                [chunk.text for chunk in chunks],
                self.settings,
            )
        except Exception as exc:
            logger.warning(
                "document_indexing_embedding_failed",
                document_version_id=document_version.id,
                exception_type=type(exc).__name__,
                chunk_count=len(chunks),
            )
            raise DocumentNotNormalizedError("Document embedding generation failed.") from exc

        chunk_records: list[dict[str, Any]] = [
            {
                "id": chunk.chunk_id,
                "document_id": logical_document_id,
                "document_revision_id": document_version.id,
                "space_id": space_id,
                "text": chunk.text,
                "metadata": chunk.metadata,
            }
            for chunk in chunks
        ]

        self.chroma_store.upsert(
            chunk_records,
            embeddings=embeddings,
            generation=target_generation,
        )
        self.retrieval_chunk_repository.upsert_records(
            chunk_records,
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
        self.retrieval_chunk_repository.delete_by_document_id(
            document_version.id,
            generation=target_generation,
        )
        document_version.chunk_count = 0
