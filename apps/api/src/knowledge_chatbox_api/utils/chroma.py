"""Local chunk store adapters backed by Chroma or in-memory state."""

import threading
from functools import lru_cache
from pathlib import Path
from typing import Any, Protocol

from chromadb import PersistentClient
from chromadb.api.models.Collection import Collection
from pydantic import BaseModel, ConfigDict, Field, field_validator

from knowledge_chatbox_api.core.config import get_settings
from knowledge_chatbox_api.core.logging import get_logger
from knowledge_chatbox_api.schemas.chunk import (
    ChromaWhereFilter,
    ChunkRecordMetadata,
    ChunkStoreRecord,
)
from knowledge_chatbox_api.utils.text_matching import (
    normalize_and_tokenize as _normalize_and_tokenize,
)
from knowledge_chatbox_api.utils.text_matching import (
    quoted_phrases as _quoted_phrases,
)
from knowledge_chatbox_api.utils.text_matching import (
    raw_quoted_phrases as _raw_quoted_phrases,
)

CHROMA_COLLECTION_NAME = "knowledge_chatbox_chunks"
METADATA_PREFIX = "meta__"
VECTOR_RERANK_CANDIDATE_MULTIPLIER = 4
TEXT_FALLBACK_MAX_WHERE_DOCUMENT_TERMS = 6

logger = get_logger(__name__)


class _ChromaRecordMetadata(BaseModel):
    """ChromaDB 存储的记录元数据，自动处理类型强制转换。

    ChromaDB 元数据值类型为 str | int | float | bool，
    反序列化时通过 Pydantic 验证器自动转为目标类型。
    """

    model_config = ConfigDict(extra="allow")

    document_id: int = Field(validation_alias="document_id")
    document_revision_id: int | None = None
    space_id: int | None = None

    @field_validator("document_id", "document_revision_id", "space_id", mode="before")
    @classmethod
    def coerce_to_int(cls, value: Any) -> Any:
        """将 ChromaDB 返回的字符串/浮点数元数据强制转为 int。"""
        if value is None:
            return None
        return int(value)


class ChunkStore(Protocol):
    """Chunk 持久化协议，供索引和检索服务使用。

    定义了 chunk 存储的最小接口契约，PersistentChromaStore 和
    InMemoryChromaStore（测试用）均实现此协议。
    """

    def warmup(self, generation: int = 1) -> None: ...

    def upsert(
        self,
        records: list[ChunkStoreRecord],
        *,
        embeddings: list[list[float]] | None = None,
        generation: int = 1,
    ) -> None: ...

    def list_by_revision_id(
        self,
        revision_id: int,
        *,
        generation: int = 1,
    ) -> list[ChunkStoreRecord]:
        """返回指定文档修订版本的所有 chunk，包含嵌入向量。"""
        ...

    def delete_by_revision_id(self, revision_id: int, *, generation: int = 1) -> None:
        """删除指定文档修订版本的所有 chunk。"""
        ...

    def clear_generation(self, generation: int) -> None:
        """删除指定 generation 的所有 chunk。"""
        ...

    def query(
        self,
        query_text: str,
        *,
        query_embedding: list[float] | None = None,
        top_k: int = 3,
        generation: int = 1,
        where: ChromaWhereFilter | None = None,
    ) -> list[ChunkStoreRecord]:
        """返回与查询最匹配的 top_k 个 chunk。"""
        ...


def collection_name_for_generation(generation: int) -> str:
    """根据 generation 编号生成 ChromaDB collection 名称。"""
    return f"{CHROMA_COLLECTION_NAME}__gen_{generation:04d}"


def _is_collection_missing_error(error: BaseException) -> bool:
    """递归检查异常链中是否包含 ChromaDB NotFoundError。"""
    from chromadb.errors import NotFoundError

    if isinstance(error, NotFoundError):
        return True
    if error.__cause__ is not None:
        return _is_collection_missing_error(error.__cause__)
    return False


def text_fallback_where_document_terms(query_text: str) -> list[str]:
    """从查询文本中提取用于 ChromaDB where_document 条件的候选词。

    提取优先级：引号短语 > 原始查询 > 归一化 token，
    最多返回 TEXT_FALLBACK_MAX_WHERE_DOCUMENT_TERMS 个候选。
    """
    candidates: list[str] = []
    seen: set[str] = set()

    def add_candidate(candidate: str) -> None:
        normalized = candidate.strip()
        if not normalized or normalized in seen:
            return
        seen.add(normalized)
        candidates.append(normalized)

    for phrase in _raw_quoted_phrases(query_text):
        add_candidate(phrase)

    stripped_query = query_text.strip()
    if 2 <= len(stripped_query) <= 120:
        add_candidate(stripped_query)

    _, query_tokens = _normalize_and_tokenize(query_text)
    for token in sorted(query_tokens, key=lambda t: (-len(t), t)):
        if token.isascii() and len(token) < 3:
            continue
        if not token.isascii() and len(token) < 2:
            continue
        add_candidate(token)
        if len(candidates) >= TEXT_FALLBACK_MAX_WHERE_DOCUMENT_TERMS:
            break

    return candidates[:TEXT_FALLBACK_MAX_WHERE_DOCUMENT_TERMS]


def _score_records(
    records: list[ChunkStoreRecord],
    query_text: str,
    *,
    top_k: int,
) -> list[ChunkStoreRecord]:
    """使用文本重叠评分对候选记录重排，返回 top_k 个最相关记录。

    评分策略：
    - token 重叠率 = 重叠 token 数 / 查询 token 数
    - 引号短语命中数（每个 +1.0）
    - 完整查询子串命中（+1.0）
    """
    query_normalized, query_tokens = _normalize_and_tokenize(query_text)
    query_phrases = _quoted_phrases(query_text)

    if not query_tokens and not query_phrases and len(query_normalized) < 2:
        return []

    scored_records: list[tuple[float, ChunkStoreRecord]] = []
    query_term_count = max(len(query_tokens), 1)

    for record in records:
        section_title = record.metadata.section_title or ""
        haystack = f"{record.text} {section_title}"
        normalized_haystack, tokens = _normalize_and_tokenize(haystack)

        has_overlap = False
        for phrase in query_phrases:
            if phrase in normalized_haystack:
                has_overlap = True
                break
        if (
            not has_overlap
            and len(query_normalized) >= 2
            and query_normalized in normalized_haystack
        ):
            has_overlap = True
        if not has_overlap and len(query_tokens & tokens) == 0:
            continue

        overlap = len(query_tokens & tokens)
        score = overlap / query_term_count
        phrase_hits = sum(1 for phrase in query_phrases if phrase in normalized_haystack)
        if phrase_hits:
            score += float(phrase_hits)
        if len(query_normalized) >= 2 and query_normalized in normalized_haystack:
            score += 1.0
        scored_records.append((score, record))

    scored_records.sort(key=lambda item: item[0], reverse=True)
    return [record.model_copy(update={"score": score}) for score, record in scored_records[:top_k]]


def _matches_where_clause(record: ChunkStoreRecord, clause: ChromaWhereFilter) -> bool:
    """判断记录是否匹配 ChromaDB 风格的 where 子句。

    支持 $and、$or 逻辑组合和 $in 包含操作符。
    """
    if "$and" in clause:
        and_clauses = clause["$and"]
        if isinstance(and_clauses, list):
            return all(
                isinstance(item, dict) and _matches_where_clause(record, item)
                for item in and_clauses
            )

    if "$or" in clause:
        or_clauses = clause["$or"]
        if isinstance(or_clauses, list):
            return any(
                isinstance(item, dict) and _matches_where_clause(record, item)
                for item in or_clauses
            )

    for key, expected in clause.items():
        if key.startswith("$"):
            return False
        record_dict = record.model_dump()
        actual = record_dict.get(key)
        if actual is None:
            actual = record_dict.get("metadata", {}).get(key)
        if isinstance(expected, dict):
            if "$in" not in expected or actual not in expected["$in"]:
                return False
            continue
        if actual != expected:
            return False
    return True


def _normalize_chroma_where(where: ChromaWhereFilter | None) -> ChromaWhereFilter | None:
    """将多字段 where 条件归一化为 ChromaDB 要求的 $and 格式。

    ChromaDB 要求多字段条件必须使用 $and 组合，
    单字段条件或已包含 $/$or 的条件直接返回。
    """
    if not where:
        return None
    if len(where) == 1 or any(key.startswith("$") for key in where):
        return where
    return {"$and": [{key: value} for key, value in where.items()]}


class PersistentChromaStore:
    """基于本地 Chroma 持久化存储的 chunk 存储实现。

    每个 generation 对应一个独立的 ChromaDB collection，
    通过线程锁保证 collection 获取的线程安全。
    """

    def __init__(self, storage_path: Path) -> None:
        self.storage_path = storage_path
        storage_path.mkdir(parents=True, exist_ok=True)
        self._client = PersistentClient(path=str(storage_path))
        self._collections: dict[int, Collection] = {}
        self._lock = threading.Lock()

    def _collection_for_generation(self, generation: int) -> Collection:
        """获取或创建指定 generation 的 ChromaDB collection。"""
        normalized_generation = max(int(generation), 1)
        with self._lock:
            collection = self._collections.get(normalized_generation)
            if collection is not None:
                return collection
            collection = self._client.get_or_create_collection(
                name=collection_name_for_generation(normalized_generation),
                metadata={
                    "purpose": "knowledge-chatbox-chunks",
                    "generation": normalized_generation,
                },
            )
            self._collections[normalized_generation] = collection
            return collection

    def warmup(self, generation: int = 1) -> None:
        """预加载指定 generation 的 collection，加速首次查询。"""
        self._collection_for_generation(generation)

    def upsert(
        self,
        records: list[ChunkStoreRecord],
        *,
        embeddings: list[list[float]] | None = None,
        generation: int = 1,
    ) -> None:
        """插入或替换 chunk 记录到本地 Chroma collection。"""
        if not records:
            return

        try:
            collection = self._collection_for_generation(generation)
            collection.upsert(
                ids=[record.id for record in records],
                documents=[record.text for record in records],
                metadatas=[self._serialize_record_metadata(record) for record in records],
                embeddings=embeddings,  # type: ignore[arg-type]
            )
        except Exception as error:
            logger.error(
                "chroma_upsert_failed",
                generation=generation,
                record_count=len(records),
                error=str(error),
                exc_info=True,
            )
            raise

    def list_by_revision_id(
        self,
        revision_id: int,
        *,
        generation: int = 1,
    ) -> list[ChunkStoreRecord]:
        """加载指定文档修订版本的所有 chunk。"""
        collection = self._collection_for_generation(generation)
        result = collection.get(
            where=_normalize_chroma_where({"document_revision_id": revision_id}),
            include=["documents", "metadatas"],
        )
        return self._deserialize_records(result)

    def delete_by_revision_id(self, revision_id: int, *, generation: int = 1) -> None:
        """删除指定文档修订版本的所有 chunk。"""
        collection = self._collection_for_generation(generation)
        collection.delete(where=_normalize_chroma_where({"document_revision_id": revision_id}))

    def clear_generation(self, generation: int) -> None:
        """删除指定 generation 的 collection。"""
        normalized_generation = max(int(generation), 1)
        collection_name = collection_name_for_generation(normalized_generation)
        self._collections.pop(normalized_generation, None)
        try:
            self._client.delete_collection(collection_name)
        except Exception as error:
            if _is_collection_missing_error(error):
                return
            logger.debug("chroma_clear_generation_failed", generation=generation, exc_info=True)
            raise

    def query(
        self,
        query_text: str,
        *,
        query_embedding: list[float] | None = None,
        top_k: int = 3,
        generation: int = 1,
        where: ChromaWhereFilter | None = None,
    ) -> list[ChunkStoreRecord]:
        """向量检索 + 文本重叠重排，返回最相关的 top_k 个 chunk。

        检索流程：
        1. 通过向量相似度召回 candidate_limit 个候选
        2. 使用文本重叠评分对候选重排
        3. 合并重排结果与向量结果，取 top_k
        """
        collection = self._collection_for_generation(generation)
        chroma_where = _normalize_chroma_where(where)

        if query_embedding is None:
            return []

        candidate_limit = max(top_k * VECTOR_RERANK_CANDIDATE_MULTIPLIER, top_k)
        result = collection.query(
            query_embeddings=[query_embedding],
            n_results=candidate_limit,
            include=["documents", "metadatas", "distances"],
            where=chroma_where,
        )
        vector_records = self._deserialize_query_records(result)

        if not query_text or not vector_records:
            return vector_records[:top_k] if vector_records else []

        reranked_records = _score_records(
            vector_records,
            query_text,
            top_k=candidate_limit,
        )

        if reranked_records:
            return self._merge_records(reranked_records, vector_records, top_k=top_k)

        return vector_records[:top_k]

    def clear(self) -> None:
        """删除当前持久化存储下的所有 collection 数据。"""
        collections = list(self._collections.values())
        self._collections.clear()
        for collection in collections:
            try:
                self._client.delete_collection(collection.name)
            except Exception:
                logger.debug("chroma_delete_collection_failed", name=collection.name, exc_info=True)
                continue
        try:
            for collection in self._client.list_collections():
                if collection.name.startswith(f"{CHROMA_COLLECTION_NAME}__gen_"):
                    self._client.delete_collection(collection.name)
        except Exception:
            logger.debug("chroma_list_collections_failed", exc_info=True)
            return

    def _serialize_record_metadata(
        self,
        record: ChunkStoreRecord,
    ) -> dict[str, str | int | float | bool]:
        """将记录元数据序列化为 ChromaDB 兼容格式。"""
        metadata: dict[str, str | int | float | bool] = {}
        if record.document_id is not None:
            metadata["document_id"] = record.document_id
        metadata["document_revision_id"] = record.document_revision_id
        if record.space_id is not None:
            metadata["space_id"] = record.space_id
        for key, value in record.metadata.model_dump().items():
            if isinstance(value, (str, int, float, bool)):
                metadata[f"{METADATA_PREFIX}{key}"] = value
        return metadata

    def _build_record_from_metadata(
        self,
        record_id: str,
        text: str,
        metadata: dict[str, Any],
        *,
        embedding: list[float] | None = None,
        score: float | None = None,
    ) -> ChunkStoreRecord:
        """从 ChromaDB 元数据反序列化为 ChunkStoreRecord。"""
        parsed = _ChromaRecordMetadata.model_validate(metadata, from_attributes=True)
        chunk_metadata = ChunkRecordMetadata(
            section_title=metadata.get(f"{METADATA_PREFIX}section_title"),
            page_number=metadata.get(f"{METADATA_PREFIX}page_number"),
        )
        return ChunkStoreRecord(
            id=record_id,
            document_id=parsed.document_id,
            document_revision_id=parsed.document_revision_id or parsed.document_id,
            space_id=parsed.space_id,
            text=text or "",
            metadata=chunk_metadata,
            embedding=embedding,
            score=score,
        )

    def _deserialize_records(self, result: Any) -> list[ChunkStoreRecord]:
        """将 ChromaDB get() 结果反序列化为 ChunkStoreRecord 列表。"""
        ids = list(result.get("ids") or [])
        documents = list(result.get("documents") or [])
        metadatas = list(result.get("metadatas") or [])
        raw_embeddings = result.get("embeddings")
        embeddings = [] if raw_embeddings is None else list(raw_embeddings)
        records: list[ChunkStoreRecord] = []

        for index, record_id in enumerate(ids):
            metadata = metadatas[index] or {}
            embedding = embeddings[index] if index < len(embeddings) else None
            records.append(
                self._build_record_from_metadata(
                    record_id,
                    documents[index],
                    metadata,
                    embedding=embedding,
                )
            )

        return records

    def _deserialize_query_records(self, result: Any) -> list[ChunkStoreRecord]:
        """将 ChromaDB query() 结果反序列化为 ChunkStoreRecord 列表。"""
        ids = list((result.get("ids") or [[]])[0] or [])
        documents = list((result.get("documents") or [[]])[0] or [])
        metadatas = list((result.get("metadatas") or [[]])[0] or [])
        distances = list((result.get("distances") or [[]])[0] or [])
        records: list[ChunkStoreRecord] = []

        for index, record_id in enumerate(ids):
            metadata = metadatas[index] or {}
            distance = distances[index] if index < len(distances) else None
            score = max(0.0, 1.0 - float(distance)) if distance is not None else 0.0
            records.append(
                self._build_record_from_metadata(
                    record_id,
                    documents[index],
                    metadata,
                    score=score,
                )
            )

        return records

    def _merge_records(
        self,
        primary: list[ChunkStoreRecord],
        secondary: list[ChunkStoreRecord],
        *,
        top_k: int,
    ) -> list[ChunkStoreRecord]:
        """合并重排结果与向量结果，去重后取 top_k。"""
        merged = list(primary)
        seen = {record.id for record in primary}
        for record in secondary:
            if record.id in seen:
                continue
            merged.append(record)
            seen.add(record.id)
            if len(merged) >= top_k:
                break
        return merged


@lru_cache(maxsize=1)
def _get_persistent_chroma_store(storage_path: Path) -> PersistentChromaStore:
    """缓存配置路径对应的持久化存储实例。"""
    return PersistentChromaStore(storage_path.resolve())


def get_chroma_store() -> PersistentChromaStore:
    """返回当前运行时配置的持久化 Chroma 存储。"""
    settings = get_settings()
    return _get_persistent_chroma_store(settings.chroma_path)


def reset_chroma_store(
    *,
    clear_persisted: bool = False,
    storage_path: str | Path | None = None,
) -> None:
    """重置缓存的持久化存储，可选删除磁盘数据。

    注意：不调用 store._client._system.stop()，因为 ChromaDB 使用全局 Rust bindings，
    stop() 会导致后续无法创建新的 Client。文件句柄问题通过测试隔离的临时目录解决。
    """
    resolved_path = (
        Path(storage_path) if storage_path is not None else Path(get_settings().chroma_path)
    )
    store = _get_persistent_chroma_store(resolved_path)
    if clear_persisted:
        store.clear()
    _get_persistent_chroma_store.cache_clear()
