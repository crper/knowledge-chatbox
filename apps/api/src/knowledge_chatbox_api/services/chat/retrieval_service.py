"""Knowledge retrieval helpers used by chat prompt assembly."""

from __future__ import annotations

from dataclasses import dataclass, field
from time import perf_counter
from typing import Any

from sqlalchemy import and_, or_, select

from knowledge_chatbox_api.core.logging import get_logger
from knowledge_chatbox_api.models.document import Document, DocumentRevision
from knowledge_chatbox_api.repositories.document_repository import DocumentRepository
from knowledge_chatbox_api.repositories.retrieval_chunk_repository import RetrievalChunkRepository
from knowledge_chatbox_api.utils.chroma import (
    _normalize_match_text,
    _quoted_phrases,
    _tokenize_text,
)

MIN_RETRIEVAL_SOURCE_SCORE = 0.45
ATTACHMENT_SCOPED_QUERY_MULTIPLIER = 3

# 简单对话查询集合（无需知识检索）
SMALL_TALK_QUERIES = frozenset(
    {
        "hello",
        "hey",
        "hi",
        "ok",
        "okay",
        "你好",
        "你好啊",
        "你好呀",
        "再见",
        "有人吗",
        "哈喽",
        "嗨",
        "在吗",
        "在不在",
        "晚上好",
        "晚安",
        "早上好",
        "早安",
        "下午好",
        "收到",
        "拜拜",
        "谢谢",
        "谢谢你",
        "多谢",
        "好的",
        "您好",
    }
)

# 通用图像分析查询（仅图片附件时跳过检索）
GENERIC_IMAGE_ONLY_QUERIES = frozenset(
    _normalize_match_text(value)
    for value in {
        "帮我看看这张图",
        "帮我看看这幅图",
        "看看这张图",
        "看看这幅图",
        "描述这张图",
        "描述这幅图",
        "分析这张图",
        "分析这幅图",
        "这张图说了什么",
        "这幅图说了什么",
        "describe this image",
        "analyze this image",
        "look at this image",
        "what does this image say",
    }
)

logger = get_logger(__name__)


@dataclass(frozen=True)
class RetrievalDiagnostics:
    """Structured retrieval diagnostics for prompt assembly logging."""

    strategy: str = "none"
    latency_ms: int = 0
    candidate_count: int = 0
    attachment_revision_scope_count: int = 0


@dataclass(frozen=True)
class RetrievedContext:
    """Structured retrieval result for prompt assembly."""

    context_sections: list[str]
    sources: list[dict[str, Any]]
    diagnostics: RetrievalDiagnostics = field(default_factory=RetrievalDiagnostics)


class RetrievalService:
    """Encapsulate retrieval eligibility, execution, and source shaping."""

    def __init__(
        self,
        *,
        session,
        chroma_store,
        embedding_adapter,
        settings,
    ) -> None:
        self.session = session
        self.chroma_store = chroma_store
        self.embedding_adapter = embedding_adapter
        self.settings = settings
        self.document_repository = DocumentRepository(session)
        self.retrieval_chunk_repository = RetrievalChunkRepository(session)

    def retrieve_context(
        self,
        query_text: str,
        *,
        active_space_id: int | None,
        attachments: list[dict[str, Any]] | None = None,
    ) -> RetrievedContext:
        """检索与查询相关的知识上下文。"""
        started_at = perf_counter()
        normalized_query = query_text.strip()
        attachment_revision_ids = sorted(self._collect_attachment_revision_ids(attachments))
        where_filter = self._build_retrieval_where_filter(active_space_id, attachments)
        attachment_revision_scope_count = len(attachment_revision_ids)

        # 快速路径：无需检索的场景
        if not self._should_retrieve_knowledge(normalized_query, attachments=attachments):
            return self._empty_context(started_at, attachment_revision_scope_count, strategy="none")

        if not self._has_retrievable_documents(active_space_id):
            return self._empty_context(started_at, attachment_revision_scope_count, strategy="none")

        generation = getattr(self.settings, "active_index_generation", 1)
        query_embedding = self._embed_query_or_none(normalized_query)

        # 尝试向量检索
        vector_chunks = self._query_retrieved_chunks(
            normalized_query,
            active_space_id=active_space_id,
            attachment_revision_ids=attachment_revision_ids,
            generation=generation,
            query_embedding=query_embedding,
            where_filter=where_filter,
        )
        vector_candidate_count = len(vector_chunks)
        relevant_vector_chunks = [
            record
            for record in vector_chunks
            if self._is_relevant_retrieval_hit(record, normalized_query)
        ]

        if relevant_vector_chunks:
            return self._build_retrieved_context(
                relevant_vector_chunks,
                active_space_id,
                diagnostics=self._build_diagnostics(
                    strategy="vector",
                    started_at=started_at,
                    candidate_count=vector_candidate_count,
                    attachment_revision_scope_count=attachment_revision_scope_count,
                ),
            )

        # 回退到词法检索
        lexical_chunks = self._query_lexical_chunks(
            normalized_query,
            active_space_id=active_space_id,
            attachment_revision_ids=attachment_revision_ids,
            generation=generation,
        )
        lexical_candidate_count = len(lexical_chunks)
        relevant_lexical_chunks = [
            record
            for record in lexical_chunks
            if self._is_relevant_retrieval_hit(record, normalized_query)
        ]

        if relevant_lexical_chunks:
            return self._build_retrieved_context(
                relevant_lexical_chunks,
                active_space_id,
                diagnostics=self._build_diagnostics(
                    strategy="lexical",
                    started_at=started_at,
                    candidate_count=lexical_candidate_count,
                    attachment_revision_scope_count=attachment_revision_scope_count,
                ),
            )

        return self._empty_context(started_at, attachment_revision_scope_count, strategy="none")

    def _empty_context(
        self,
        started_at: float,
        attachment_revision_scope_count: int,
        strategy: str = "none",
    ) -> RetrievedContext:
        """返回空检索结果。"""
        return RetrievedContext(
            context_sections=[],
            sources=[],
            diagnostics=self._build_diagnostics(
                strategy=strategy,
                started_at=started_at,
                candidate_count=0,
                attachment_revision_scope_count=attachment_revision_scope_count,
            ),
        )

    def _has_retrievable_documents(self, space_id: int | None) -> bool:
        """检查空间中是否存在可检索的文档。"""
        if space_id is None:
            return False

        exists_query = (
            select(1)
            .select_from(DocumentRevision)
            .join(Document, Document.id == DocumentRevision.document_id)
            .where(
                Document.space_id == space_id,
                Document.status == "active",
                or_(
                    Document.latest_revision_id == DocumentRevision.id,
                    and_(
                        Document.latest_revision_id.is_(None),
                        DocumentRevision.revision_no == Document.current_version_number,
                    ),
                ),
                DocumentRevision.ingest_status == "indexed",
            )
            .limit(1)
        )

        result = self.session.execute(select(exists_query.exists())).scalar()
        return bool(result)

    def _build_retrieved_context(
        self,
        retrieved_chunks: list[dict[str, Any]],
        active_space_id: int | None,
        *,
        diagnostics: RetrievalDiagnostics,
    ) -> RetrievedContext:
        """从检索到的块构建上下文。"""
        versions_by_id, documents_by_id = self._load_retrieved_document_context(retrieved_chunks)
        context_sections: list[str] = []
        sources: list[dict[str, Any]] = []

        for record in retrieved_chunks:
            score = record.get("score")
            if isinstance(score, (int, float)) and score < 0.1:
                continue

            revision_id = record.get("document_revision_id", record["document_id"])
            document_version = versions_by_id.get(revision_id)

            if document_version is None:
                document_name = f"Document {record['document_id']}"
            else:
                document = documents_by_id.get(document_version.document_id)
                if document is not None and not self._is_valid_document_version(
                    document, document_version, active_space_id
                ):
                    continue
                document_name = (
                    document.logical_name
                    if document is not None
                    else f"Document {record['document_id']}"
                )

            metadata = record["metadata"]
            page_number = metadata.get("page_number")
            section_title = metadata.get("section_title")
            record_text = record["text"]

            context_sections.append(
                "\n".join(
                    filter(
                        None,
                        [
                            f"Document: {document_name}",
                            f"Section: {section_title}" if section_title else None,
                            f"Page: {page_number}" if page_number is not None else None,
                            f"Content: {record_text}",
                        ],
                    )
                )
            )
            sources.append(
                {
                    "document_id": record["document_id"],
                    "document_revision_id": revision_id,
                    "document_name": document_name,
                    "chunk_id": record["id"],
                    "snippet": record_text[:240],
                    "page_number": page_number,
                    "section_title": section_title,
                    "score": score,
                }
            )

        return RetrievedContext(
            context_sections=context_sections,
            sources=sources,
            diagnostics=diagnostics,
        )

    def _is_valid_document_version(
        self,
        document: Document,
        document_version: DocumentRevision,
        active_space_id: int | None,
    ) -> bool:
        """验证文档版本是否有效（在正确空间且为最新版本）。"""
        if document.space_id != active_space_id:
            return False
        return (
            document.latest_revision_id == document_version.id
            or document.current_version_number == document_version.revision_no
        )

    def _build_diagnostics(
        self,
        *,
        strategy: str,
        started_at: float,
        candidate_count: int,
        attachment_revision_scope_count: int,
    ) -> RetrievalDiagnostics:
        """构建检索诊断信息。"""
        latency_ms = max(int(round((perf_counter() - started_at) * 1000)), 0)
        return RetrievalDiagnostics(
            strategy=strategy,
            latency_ms=latency_ms,
            candidate_count=candidate_count,
            attachment_revision_scope_count=attachment_revision_scope_count,
        )

    def _load_retrieved_document_context(
        self,
        retrieved_chunks: list[dict[str, Any]],
    ) -> tuple[dict[int, DocumentRevision], dict[int, Document]]:
        """加载检索结果相关的文档上下文。"""
        version_ids = {
            record.get("document_revision_id", record.get("document_id"))
            for record in retrieved_chunks
            if isinstance(record.get("document_revision_id", record.get("document_id")), int)
        }
        if not version_ids:
            return {}, {}

        versions = list(
            self.session.scalars(
                select(DocumentRevision).where(DocumentRevision.id.in_(version_ids))
            ).all()
        )
        versions_by_id = {version.id: version for version in versions}
        document_ids = {version.document_id for version in versions}

        if not document_ids:
            return versions_by_id, {}

        documents = list(
            self.session.scalars(select(Document).where(Document.id.in_(document_ids))).all()
        )
        documents_by_id = {document.id: document for document in documents}
        return versions_by_id, documents_by_id

    def _embed_query_or_none(self, query_text: str) -> list[float] | None:
        """生成查询嵌入，失败时返回 None。"""
        try:
            embeddings = self.embedding_adapter.embed([query_text], self.settings)
        except Exception as exc:  # noqa: BLE001
            logger.warning(
                "Retrieval degraded because query embedding generation failed",
                exception_type=type(exc).__name__,
                query_length=len(query_text),
            )
            return None
        return embeddings[0] if embeddings else None

    def _should_retrieve_knowledge(
        self,
        query_text: str,
        *,
        attachments: list[dict[str, Any]] | None = None,
    ) -> bool:
        """判断是否需要执行知识检索。"""
        if self._is_image_only_analysis_turn(query_text, attachments):
            return False

        normalized_query = _normalize_match_text(query_text)
        if not normalized_query:
            return False
        return normalized_query not in SMALL_TALK_QUERIES

    def _is_image_only_analysis_turn(
        self,
        query_text: str,
        attachments: list[dict[str, Any]] | None,
    ) -> bool:
        """判断是否为仅图片分析场景。"""
        if not self._has_only_image_attachments(attachments):
            return False

        normalized_query = _normalize_match_text(query_text)
        if not normalized_query:
            return True

        return normalized_query in GENERIC_IMAGE_ONLY_QUERIES

    def _has_only_image_attachments(self, attachments: list[dict[str, Any]] | None) -> bool:
        """检查是否只有图片附件。"""
        if not attachments:
            return False
        return all(attachment.get("type") == "image" for attachment in attachments)

    def _build_retrieval_where_filter(
        self,
        active_space_id: int | None,
        attachments: list[dict[str, Any]] | None,
    ) -> dict[str, Any] | None:
        """构建检索的 WHERE 过滤条件。"""
        conditions: list[dict[str, Any]] = []
        if active_space_id is not None:
            conditions.append({"space_id": active_space_id})

        attachment_revision_ids = sorted(self._collect_attachment_revision_ids(attachments))
        if attachment_revision_ids:
            conditions.append({"document_revision_id": {"$in": attachment_revision_ids}})

        if not conditions:
            return None
        if len(conditions) == 1:
            return conditions[0]
        return {"$and": conditions}

    def _query_retrieved_chunks(
        self,
        query_text: str,
        *,
        active_space_id: int | None,
        attachment_revision_ids: list[int],
        generation: int,
        query_embedding: list[float] | None,
        where_filter: dict[str, Any] | None,
    ) -> list[dict[str, Any]]:
        """执行向量检索查询。"""
        if len(attachment_revision_ids) <= 1:
            return self.chroma_store.query(
                query_text,
                query_embedding=query_embedding,
                top_k=3,
                generation=generation,
                where=where_filter,
            )

        records = self.chroma_store.query(
            query_text,
            query_embedding=query_embedding,
            top_k=self._attachment_scoped_top_k(attachment_revision_ids),
            generation=generation,
            where=where_filter,
        )
        return self._select_attachment_scoped_records(records, attachment_revision_ids)

    def _query_lexical_chunks(
        self,
        query_text: str,
        *,
        active_space_id: int | None,
        attachment_revision_ids: list[int],
        generation: int,
    ) -> list[dict[str, Any]]:
        """执行词法检索查询。"""
        if len(attachment_revision_ids) <= 1:
            return self.retrieval_chunk_repository.query(
                query_text,
                generation=generation,
                top_k=3,
                space_id=active_space_id,
                document_revision_ids=attachment_revision_ids or None,
            )

        records = self.retrieval_chunk_repository.query(
            query_text,
            generation=generation,
            top_k=self._attachment_scoped_top_k(attachment_revision_ids),
            space_id=active_space_id,
            document_revision_ids=attachment_revision_ids,
        )
        return self._select_attachment_scoped_records(records, attachment_revision_ids)

    def _collect_attachment_revision_ids(
        self,
        attachments: list[dict[str, Any]] | None,
    ) -> set[int]:
        """收集附件中的文档版本 ID。"""
        if not attachments:
            return set()

        return {
            revision_id
            for attachment in attachments
            if isinstance(revision_id := attachment.get("document_revision_id"), int)
        }

    def _attachment_scoped_top_k(self, attachment_revision_ids: list[int]) -> int:
        """计算附件范围的 top_k 值。"""
        return max(len(attachment_revision_ids) * ATTACHMENT_SCOPED_QUERY_MULTIPLIER, 3)

    def _select_attachment_scoped_records(
        self,
        records: list[dict[str, Any]],
        attachment_revision_ids: list[int],
    ) -> list[dict[str, Any]]:
        """从附件范围的记录中选择代表性结果。"""
        if len(attachment_revision_ids) <= 1:
            return records

        max_selected = len(attachment_revision_ids)
        records_by_revision: dict[int, list[dict[str, Any]]] = {
            revision_id: [] for revision_id in attachment_revision_ids
        }
        for record in records:
            revision_id = record.get("document_revision_id")
            if isinstance(revision_id, int) and revision_id in records_by_revision:
                records_by_revision[revision_id].append(record)

        selected: list[dict[str, Any]] = []
        seen_chunk_ids: set[str] = set()
        revision_iterators: dict[int, int] = {rid: 0 for rid in attachment_revision_ids}

        while True:
            round_added = False
            for revision_id in attachment_revision_ids:
                revision_records = records_by_revision[revision_id]
                idx = revision_iterators[revision_id]
                while idx < len(revision_records):
                    record = revision_records[idx]
                    revision_iterators[revision_id] = idx + 1
                    chunk_id = str(record.get("id", ""))
                    if chunk_id in seen_chunk_ids:
                        idx += 1
                        continue
                    seen_chunk_ids.add(chunk_id)
                    selected.append(record)
                    round_added = True
                    if len(selected) >= max_selected:
                        return selected
                    break
            if not round_added:
                break
        return selected

    def _is_relevant_retrieval_hit(self, record: dict[str, Any], query_text: str) -> bool:
        """判断检索结果是否与查询相关。"""
        score = float(record.get("score", 0.0))
        if score >= MIN_RETRIEVAL_SOURCE_SCORE:
            return True
        return self._has_query_overlap(record, query_text)

    def _has_query_overlap(self, record: dict[str, Any], query_text: str) -> bool:
        """检查记录与查询是否有词项重叠。"""
        query_terms = _tokenize_text(query_text)
        if not query_terms:
            return False

        section_title = record.get("metadata", {}).get("section_title") or ""
        haystack = f"{record.get('text', '')} {section_title}"
        normalized_haystack = _normalize_match_text(haystack)
        normalized_query = _normalize_match_text(query_text)

        # 快速路径：检查引号短语匹配
        query_phrases = _quoted_phrases(query_text)
        if any(phrase in normalized_haystack for phrase in query_phrases):
            return True

        # 检查完整查询匹配
        if len(normalized_query) >= 2 and normalized_query in normalized_haystack:
            return True

        # 检查词项重叠
        haystack_tokens = _tokenize_text(haystack)
        return len(query_terms & haystack_tokens) > 0
