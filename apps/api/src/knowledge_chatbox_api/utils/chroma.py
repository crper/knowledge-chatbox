"""Local chunk store adapters backed by Chroma or in-memory state."""

import threading
from functools import lru_cache
from pathlib import Path
from typing import Any, Protocol, cast

from chromadb import PersistentClient

from knowledge_chatbox_api.core.config import get_settings
from knowledge_chatbox_api.core.logging import get_logger
from knowledge_chatbox_api.utils.files import ensure_directory
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


class ChunkStore(Protocol):
    """Small persistence contract used by indexing and retrieval services."""

    def warmup(self, generation: int = 1) -> None: ...

    def upsert(
        self,
        records: list[dict[str, Any]],
        *,
        embeddings: list[list[float]] | None = None,
        generation: int = 1,
    ) -> None:
        """Insert or replace chunk records."""

    def list_by_document_id(
        self,
        document_id: int,
        *,
        generation: int = 1,
    ) -> list[dict[str, Any]]:
        """Return all stored chunks for one document revision, including embeddings."""
        ...

    def delete_by_document_id(self, document_id: int, *, generation: int = 1) -> None:
        """Delete all chunks that belong to one document revision."""

    def clear_generation(self, generation: int) -> None:
        """Delete all stored chunks for a specific generation."""

    def query(
        self,
        query_text: str,
        *,
        query_embedding: list[float] | None = None,
        top_k: int = 3,
        generation: int = 1,
        where: dict[str, Any] | None = None,
    ) -> list[dict[str, Any]]:
        """Return the top matching chunks for a user query."""
        ...


def collection_name_for_generation(generation: int) -> str:
    return f"{CHROMA_COLLECTION_NAME}__gen_{generation:04d}"


def _is_collection_missing_error(error: BaseException) -> bool:
    from chromadb.errors import NotFoundError

    if isinstance(error, NotFoundError):
        return True
    if error.__cause__ is not None:
        return _is_collection_missing_error(error.__cause__)
    return False


def text_fallback_where_document_terms(query_text: str) -> list[str]:
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
    records: list[dict[str, Any]],
    query_text: str,
    *,
    top_k: int,
) -> list[dict[str, Any]]:
    query_normalized, query_tokens = _normalize_and_tokenize(query_text)
    query_phrases = _quoted_phrases(query_text)

    if not query_tokens and not query_phrases and len(query_normalized) < 2:
        return []

    scored_records: list[tuple[float, dict[str, Any]]] = []
    query_term_count = max(len(query_tokens), 1)

    for record in records:
        section_title = record.get("metadata", {}).get("section_title") or ""
        haystack = f"{record.get('text', '')} {section_title}"
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
    return [{**record, "score": score} for score, record in scored_records[:top_k]]


def _record_filter_value(record: dict[str, Any], key: str) -> Any:
    actual = record.get(key)
    if actual is None:
        actual = record.get("metadata", {}).get(key)
    return actual


def _matches_where_clause(record: dict[str, Any], clause: dict[str, Any]) -> bool:
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
        actual = _record_filter_value(record, key)
        if isinstance(expected, dict):
            if "$in" not in expected or actual not in expected["$in"]:
                return False
            continue
        if actual != expected:
            return False
    return True


def _normalize_chroma_where(where: dict[str, Any] | None) -> dict[str, Any] | None:
    if not where:
        return None
    if len(where) == 1 or any(key.startswith("$") for key in where):
        return where
    return {"$and": [{key: value} for key, value in where.items()]}


class PersistentChromaStore:
    """Persist chunk records in a local Chroma collection under `chroma_path`."""

    def __init__(self, storage_path: Path) -> None:
        self.storage_path = storage_path
        ensure_directory(storage_path)
        self._client = PersistentClient(path=str(storage_path))
        self._collections: dict[int, Any] = {}
        self._lock = threading.Lock()

    def _collection_for_generation(self, generation: int) -> Any:
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
        """Pre-load the collection for *generation* so the first query is fast."""
        self._collection_for_generation(generation)

    def upsert(
        self,
        records: list[dict[str, Any]],
        *,
        embeddings: list[list[float]] | None = None,
        generation: int = 1,
    ) -> None:
        """Persist or replace chunk records inside the local Chroma collection."""
        if not records:
            return

        collection = self._collection_for_generation(generation)
        collection.upsert(
            ids=[record["id"] for record in records],
            documents=[record["text"] for record in records],
            metadatas=[self._serialize_record_metadata(record) for record in records],
            embeddings=cast("Any", embeddings),
        )

    def list_by_document_id(
        self,
        document_id: int,
        *,
        generation: int = 1,
    ) -> list[dict[str, Any]]:
        """Load all chunks for one document version from persistent storage."""
        collection = self._collection_for_generation(generation)
        result = collection.get(
            where=_normalize_chroma_where({"document_revision_id": document_id}),
            include=["documents", "metadatas"],
        )
        return self._deserialize_records(result)

    def delete_by_document_id(self, document_id: int, *, generation: int = 1) -> None:
        """Delete all stored chunks for one document version."""
        collection = self._collection_for_generation(generation)
        collection.delete(where=_normalize_chroma_where({"document_revision_id": document_id}))

    def clear_generation(self, generation: int) -> None:
        """Delete the collection for a specific generation."""
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
        where: dict[str, Any] | None = None,
    ) -> list[dict[str, Any]]:
        """Rank persisted chunks with the current lightweight overlap scorer."""
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
        """Delete all collection data under the current persistent store."""
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
        record: dict[str, Any],
    ) -> dict[str, str | int | float | bool]:
        metadata: dict[str, str | int | float | bool] = {}
        for key in ("document_id", "document_revision_id", "space_id"):
            value: Any = record.get(key)
            if isinstance(value, int):
                metadata[key] = value
        for key, value in (record.get("metadata") or {}).items():
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
    ) -> dict[str, Any]:
        record: dict[str, Any] = {
            "id": record_id,
            "document_id": int(metadata["document_id"]),
            "document_revision_id": int(
                metadata.get("document_revision_id", metadata["document_id"])
            ),
            "space_id": int(metadata["space_id"]) if "space_id" in metadata else None,
            "text": text or "",
            "metadata": {
                key.removeprefix(METADATA_PREFIX): value
                for key, value in metadata.items()
                if key.startswith(METADATA_PREFIX)
            },
        }
        if embedding is not None:
            record["embedding"] = list(embedding)
        if score is not None:
            record["score"] = score
        return record

    def _deserialize_records(self, result: Any) -> list[dict[str, Any]]:
        ids = list(result.get("ids") or [])
        documents = list(result.get("documents") or [])
        metadatas = list(result.get("metadatas") or [])
        raw_embeddings = result.get("embeddings")
        embeddings = [] if raw_embeddings is None else list(raw_embeddings)
        records: list[dict[str, Any]] = []

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

    def _deserialize_query_records(self, result: Any) -> list[dict[str, Any]]:
        ids = list((result.get("ids") or [[]])[0] or [])
        documents = list((result.get("documents") or [[]])[0] or [])
        metadatas = list((result.get("metadatas") or [[]])[0] or [])
        distances = list((result.get("distances") or [[]])[0] or [])
        records: list[dict[str, Any]] = []

        for index, record_id in enumerate(ids):
            metadata = metadatas[index] or {}
            distance = distances[index] if index < len(distances) else None
            score = 1.0 - float(distance) if distance is not None else 0.0
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
        primary: list[dict[str, Any]],
        secondary: list[dict[str, Any]],
        *,
        top_k: int,
    ) -> list[dict[str, Any]]:
        merged = list(primary)
        seen = {record["id"] for record in primary}
        for record in secondary:
            if record["id"] in seen:
                continue
            merged.append(record)
            seen.add(record["id"])
            if len(merged) >= top_k:
                break
        return merged


@lru_cache(maxsize=1)
def _get_persistent_chroma_store(storage_path: Path) -> PersistentChromaStore:
    """Cache one persistent store per configured Chroma path."""
    return PersistentChromaStore(storage_path)


def get_chroma_store() -> PersistentChromaStore:
    """Return the persistent store configured for the current runtime settings."""
    settings = get_settings()
    return _get_persistent_chroma_store(settings.chroma_path)


def reset_chroma_store(
    *,
    clear_persisted: bool = False,
    storage_path: str | Path | None = None,
) -> None:
    """Reset the cached persistent store, optionally removing its on-disk data."""
    resolved_path = (
        Path(storage_path) if storage_path is not None else Path(get_settings().chroma_path)
    )
    store = _get_persistent_chroma_store(resolved_path)
    if clear_persisted:
        store.clear()
    _get_persistent_chroma_store.cache_clear()
