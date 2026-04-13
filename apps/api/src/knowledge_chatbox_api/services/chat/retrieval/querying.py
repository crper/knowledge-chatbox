from typing import TYPE_CHECKING

from sqlalchemy import select
from sqlalchemy.orm import Session

from knowledge_chatbox_api.core.logging import get_logger
from knowledge_chatbox_api.models.document import (
    Document,
    DocumentRevision,
    latest_revision_join_condition,
)
from knowledge_chatbox_api.models.enums import DocumentStatus, IngestStatus
from knowledge_chatbox_api.providers.base import EmbeddingAdapterProtocol
from knowledge_chatbox_api.schemas.chunk import ChromaWhereFilter, ChunkStoreRecord
from knowledge_chatbox_api.schemas.settings import ProviderRuntimeSettings
from knowledge_chatbox_api.services.chat.retrieval.models import (
    MIN_RETRIEVAL_SOURCE_SCORE,
)
from knowledge_chatbox_api.services.chat.retrieval.policy import (
    attachment_scoped_top_k,
    select_attachment_scoped_records,
)
from knowledge_chatbox_api.utils.chroma import ChunkStore
from knowledge_chatbox_api.utils.text_matching import (
    has_text_overlap,
)

if TYPE_CHECKING:
    from knowledge_chatbox_api.repositories.retrieval_chunk_repository import (
        RetrievalChunkRepository,
    )

logger = get_logger(__name__)


class RetrievalQueryEngine:
    """检索查询引擎，协调向量检索与词法检索两条路径。

    检索策略：
    1. 向量检索（query_retrieved_chunks）：通过 ChromaDB 向量相似度召回候选，
       再用文本重叠评分重排，适合语义匹配场景。
    2. 词法检索（query_lexical_chunks）：通过 SQLite FTS5 全文检索召回候选，
       作为向量检索的兜底，适合精确关键词匹配场景。
    3. 相关性判断（is_relevant_retrieval_hit）：分数高于阈值直接判定相关，
       否则通过文本重叠检查兜底。
    """

    def __init__(
        self,
        *,
        session: Session,
        chroma_store: ChunkStore,
        embedding_adapter: EmbeddingAdapterProtocol,
        settings: ProviderRuntimeSettings,
        retrieval_chunk_repository: "RetrievalChunkRepository",
    ) -> None:
        self.session = session
        self.chroma_store = chroma_store
        self.embedding_adapter = embedding_adapter
        self.settings = settings
        self.retrieval_chunk_repository = retrieval_chunk_repository

    def has_retrievable_documents(self, space_id: int | None) -> bool:
        """检查指定空间下是否存在可检索的已索引文档。"""
        if space_id is None:
            return False

        exists_query = (
            select(1)
            .select_from(DocumentRevision)
            .join(Document, Document.id == DocumentRevision.document_id)
            .where(
                Document.space_id == space_id,
                Document.status == DocumentStatus.ACTIVE,
                latest_revision_join_condition(),
                DocumentRevision.ingest_status == IngestStatus.INDEXED,
            )
            .limit(1)
        )
        result = self.session.execute(select(exists_query.exists())).scalar()
        return bool(result)

    def embed_query_or_none(self, query_text: str) -> list[float] | None:
        """生成查询文本的嵌入向量，失败时返回 None 并记录降级日志。"""
        try:
            embeddings = self.embedding_adapter.embed([query_text], self.settings)
        except Exception as exc:
            logger.warning(
                "Retrieval degraded because query embedding generation failed",
                exception_type=type(exc).__name__,
                query_length=len(query_text),
            )
            return None
        return embeddings[0] if embeddings else None

    def _apply_attachment_scope(
        self,
        records: list[ChunkStoreRecord],
        attachment_revision_ids: list[int],
    ) -> list[ChunkStoreRecord]:
        """必要时按附件范围筛选 chunk 记录。"""
        if len(attachment_revision_ids) > 1:
            return select_attachment_scoped_records(records, attachment_revision_ids)
        return records

    def query_retrieved_chunks(
        self,
        query_text: str,
        *,
        attachment_revision_ids: list[int],
        generation: int,
        query_embedding: list[float] | None,
        where_filter: ChromaWhereFilter | None,
    ) -> list[ChunkStoreRecord]:
        """向量检索：通过 ChromaDB 向量相似度召回候选 chunk。"""
        top_k = (
            attachment_scoped_top_k(attachment_revision_ids)
            if len(attachment_revision_ids) > 1
            else 3
        )
        return self._apply_attachment_scope(
            self.chroma_store.query(
                query_text,
                query_embedding=query_embedding,
                top_k=top_k,
                generation=generation,
                where=where_filter,
            ),
            attachment_revision_ids,
        )

    def query_lexical_chunks(
        self,
        query_text: str,
        *,
        active_space_id: int | None,
        attachment_revision_ids: list[int],
        generation: int,
    ) -> list[ChunkStoreRecord]:
        """词法检索：通过 SQLite FTS5 全文检索召回候选，作为向量检索的兜底。"""
        top_k = (
            attachment_scoped_top_k(attachment_revision_ids)
            if len(attachment_revision_ids) > 1
            else 3
        )
        return self._apply_attachment_scope(
            self.retrieval_chunk_repository.query(
                query_text,
                generation=generation,
                top_k=top_k,
                space_id=active_space_id,
                document_revision_ids=attachment_revision_ids or None,
            ),
            attachment_revision_ids,
        )

    def is_relevant_retrieval_hit(
        self,
        record: ChunkStoreRecord,
        query_text: str,
        *,
        query_normalized: str | None = None,
        query_tokens: set[str] | None = None,
        query_quoted_phrases: list[str] | None = None,
    ) -> bool:
        """判断检索结果是否与查询相关：分数高于阈值直接判定，否则通过文本重叠兜底。"""
        score = record.score if record.score is not None else 0.0
        if score >= MIN_RETRIEVAL_SOURCE_SCORE:
            return True
        return self._has_query_overlap(
            record,
            query_text,
            query_normalized=query_normalized,
            query_tokens=query_tokens,
            query_quoted_phrases=query_quoted_phrases,
        )

    def _has_query_overlap(
        self,
        record: ChunkStoreRecord,
        query_text: str,
        *,
        query_normalized: str | None = None,
        query_tokens: set[str] | None = None,
        query_quoted_phrases: list[str] | None = None,
    ) -> bool:
        """检查记录文本与查询是否存在文本重叠。"""
        resolved_phrases = set(query_quoted_phrases) if query_quoted_phrases is not None else None
        section_title = record.metadata.section_title or ""
        haystack = f"{record.text} {section_title}"
        return has_text_overlap(
            query_text,
            haystack,
            query_normalized=query_normalized,
            query_tokens=query_tokens,
            query_quoted_phrases=resolved_phrases,
        )
