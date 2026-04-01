"""Local chunk store adapters backed by Chroma or in-memory state."""

from __future__ import annotations

import re
from functools import cache
from pathlib import Path
from typing import Any, Protocol, cast

from chromadb import PersistentClient

from knowledge_chatbox_api.core.config import get_settings

CHROMA_COLLECTION_NAME = "knowledge_chatbox_chunks"
METADATA_PREFIX = "meta__"
VECTOR_RERANK_CANDIDATE_MULTIPLIER = 4
TEXT_FALLBACK_MAX_WHERE_DOCUMENT_TERMS = 6


class ChunkStore(Protocol):
    """Small persistence contract used by indexing and retrieval services."""

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


def _normalize_term(term: str) -> str:
    return term.lower().strip(".,!?()[]{}:;\"'")


def _is_cjk_character(char: str) -> bool:
    codepoint = ord(char)
    return (
        0x3400 <= codepoint <= 0x4DBF
        or 0x4E00 <= codepoint <= 0x9FFF
        or 0xF900 <= codepoint <= 0xFAFF
    )


def _normalize_match_text(text: str) -> str:
    return "".join(
        char.lower()
        for char in text
        if (char.isascii() and char.isalnum()) or _is_cjk_character(char)
    )


def _is_collection_missing_error(error: Exception) -> bool:
    message = str(error).lower()
    return "not found" in message or "does not exist" in message or "doesn't exist" in message


def _quoted_phrases(text: str) -> set[str]:
    phrases = {
        _normalize_match_text(match.strip()) for match in re.findall(r'[“"「『](.+?)[”"」』]', text)
    }
    return {phrase for phrase in phrases if len(phrase) >= 2}


def _raw_quoted_phrases(text: str) -> list[str]:
    return [
        match.strip()
        for match in re.findall(r'[“"「『](.+?)[”"」』]', text)
        if len(match.strip()) >= 2
    ]


def _tokenize_text(text: str) -> set[str]:
    tokens: set[str] = set()
    ascii_buffer: list[str] = []
    cjk_buffer: list[str] = []

    def flush_ascii_buffer() -> None:
        if not ascii_buffer:
            return
        tokens.add("".join(ascii_buffer))
        ascii_buffer.clear()

    def flush_cjk_buffer() -> None:
        if not cjk_buffer:
            return
        run = "".join(cjk_buffer)
        if len(run) == 1:
            tokens.add(run)
        else:
            tokens.update(run[index : index + 2] for index in range(len(run) - 1))
        cjk_buffer.clear()

    for char in text:
        if char.isascii() and char.isalnum():
            flush_cjk_buffer()
            ascii_buffer.append(char.lower())
            continue
        if _is_cjk_character(char):
            flush_ascii_buffer()
            cjk_buffer.append(char)
            continue
        flush_ascii_buffer()
        flush_cjk_buffer()

    flush_ascii_buffer()
    flush_cjk_buffer()
    return tokens


def _text_fallback_where_document_terms(query_text: str) -> list[str]:
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

    for token in sorted(_tokenize_text(query_text), key=lambda token: (-len(token), token)):
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
    query_terms = _tokenize_text(query_text)
    query_phrases = _quoted_phrases(query_text)
    normalized_query = _normalize_match_text(query_text)
    scored_records: list[tuple[float, dict[str, Any]]] = []

    for record in records:
        section_title = record.get("metadata", {}).get("section_title") or ""
        haystack = f"{record.get('text', '')} {section_title}"
        tokens = _tokenize_text(haystack)
        overlap = len(query_terms & tokens)
        normalized_haystack = _normalize_match_text(haystack)
        phrase_hits = sum(1 for phrase in query_phrases if phrase in normalized_haystack)
        normalized_query_hit = (
            len(normalized_query) >= 2 and normalized_query in normalized_haystack
        )
        if overlap == 0 and phrase_hits == 0 and not normalized_query_hit:
            continue
        score = overlap / max(len(query_terms), 1)
        if phrase_hits:
            score += float(phrase_hits)
        if normalized_query_hit:
            score += 1.0
        scored_records.append((score, record))

    scored_records.sort(key=lambda item: item[0], reverse=True)
    return [{**record, "score": score} for score, record in scored_records[:top_k]]


def _record_filter_value(record: dict[str, Any], key: str) -> Any:
    actual = record.get(key)
    if actual is None:
        actual = record.get("metadata", {}).get(key)
    if actual is None and key == "space_id":
        actual = record.get("knowledge_base_id")
        if actual is None:
            actual = record.get("metadata", {}).get("knowledge_base_id")
    return actual


def _matches_where_clause(record: dict[str, Any], clause: dict[str, Any]) -> bool:
    and_clauses = clause.get("$and")
    if isinstance(and_clauses, list):
        return all(
            isinstance(item, dict) and _matches_where_clause(record, item) for item in and_clauses
        )

    or_clauses = clause.get("$or")
    if isinstance(or_clauses, list):
        return any(
            isinstance(item, dict) and _matches_where_clause(record, item) for item in or_clauses
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


class InMemoryChromaStore:
    """Cheap in-memory store used by unit tests and isolated service checks."""

    def __init__(self) -> None:
        self._records_by_generation: dict[int, dict[str, dict[str, Any]]] = {}

    def upsert(
        self,
        records: list[dict[str, Any]],
        *,
        embeddings: list[list[float]] | None = None,
        generation: int = 1,
    ) -> None:
        """Insert or replace records in the in-memory map."""
        store = self._records_by_generation.setdefault(generation, {})
        for index, record in enumerate(records):
            stored_record = dict(record)
            if embeddings is not None and index < len(embeddings):
                stored_record["embedding"] = embeddings[index]
            store[record["id"]] = stored_record

    def list_by_document_id(
        self,
        document_id: int,
        *,
        generation: int = 1,
    ) -> list[dict[str, Any]]:
        """Return all in-memory records for one document version."""
        records = self._records_by_generation.get(generation, {})
        return [
            record for record in records.values() if record["document_revision_id"] == document_id
        ]

    def delete_by_document_id(self, document_id: int, *, generation: int = 1) -> None:
        """Remove all in-memory records for one document version."""
        ids_to_delete = [
            record_id
            for record_id, record in self._records_by_generation.get(generation, {}).items()
            if record["document_revision_id"] == document_id
        ]
        for record_id in ids_to_delete:
            self._records_by_generation.get(generation, {}).pop(record_id, None)

    def clear_generation(self, generation: int) -> None:
        """Drop all in-memory records for a generation."""
        self._records_by_generation.pop(generation, None)

    def query(
        self,
        query_text: str,
        *,
        query_embedding: list[float] | None = None,
        top_k: int = 3,
        generation: int = 1,
        where: dict[str, Any] | None = None,
    ) -> list[dict[str, Any]]:
        """Score in-memory records with the same lightweight ranking as production."""
        del query_embedding
        records = list(self._records_by_generation.get(generation, {}).values())
        filtered = self._apply_where_filter(records, where)
        return _score_records(filtered, query_text, top_k=top_k)

    def _apply_where_filter(
        self,
        records: list[dict[str, Any]],
        where: dict[str, Any] | None,
    ) -> list[dict[str, Any]]:
        if not where:
            return records
        return [record for record in records if _matches_where_clause(record, where)]


class PersistentChromaStore:
    """Persist chunk records in a local Chroma collection under `chroma_path`."""

    def __init__(self, storage_path: Path) -> None:
        self.storage_path = storage_path
        self.storage_path.mkdir(parents=True, exist_ok=True)
        self._client = PersistentClient(path=str(storage_path))
        self._collections: dict[int, Any] = {}

    def _collection_for_generation(self, generation: int) -> Any:
        normalized_generation = max(int(generation), 1)
        collection = self._collections.get(normalized_generation)
        if collection is not None:
            return collection
        collection = self._client.get_or_create_collection(
            name=collection_name_for_generation(normalized_generation),
            metadata={"purpose": "knowledge-chatbox-chunks", "generation": normalized_generation},
        )
        self._collections[normalized_generation] = collection
        return collection

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
            embeddings=cast(Any, embeddings),
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
            include=["documents", "metadatas", "embeddings"],
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
        if query_embedding is not None:
            candidate_limit = max(top_k * VECTOR_RERANK_CANDIDATE_MULTIPLIER, top_k)
            result = collection.query(
                query_embeddings=[query_embedding],
                n_results=candidate_limit,
                include=["documents", "metadatas", "distances"],
                where=chroma_where,
            )
            vector_records = self._deserialize_query_records(result)
            if query_text and vector_records:
                reranked_records = _score_records(
                    vector_records,
                    query_text,
                    top_k=candidate_limit,
                )
                if reranked_records:
                    return self._merge_records(reranked_records, vector_records, top_k=top_k)
            if vector_records:
                return vector_records[:top_k]

        if query_text:
            candidate_limit = max(top_k * VECTOR_RERANK_CANDIDATE_MULTIPLIER, top_k)
            fallback_terms = _text_fallback_where_document_terms(query_text)
            if fallback_terms:
                primary_terms = set(_raw_quoted_phrases(query_text))
                stripped_query = query_text.strip()
                if 2 <= len(stripped_query) <= 120:
                    primary_terms.add(stripped_query)
                records_by_id: dict[str, dict[str, Any]] = {}
                for term in fallback_terms:
                    filtered_result = collection.get(
                        include=["documents", "metadatas"],
                        limit=candidate_limit,
                        where=chroma_where,
                        where_document={"$contains": term},
                    )
                    for record in self._deserialize_records(filtered_result):
                        records_by_id.setdefault(record["id"], record)
                    if len(records_by_id) >= top_k and term in primary_terms:
                        break
                    if len(records_by_id) >= candidate_limit:
                        break
                if records_by_id:
                    return _score_records(list(records_by_id.values()), query_text, top_k=top_k)

            fallback_result = collection.get(
                include=["documents", "metadatas"],
                where=chroma_where,
            )
            return _score_records(
                self._deserialize_records(fallback_result),
                query_text,
                top_k=top_k,
            )

        return []

    def clear(self) -> None:
        """Delete all collection data under the current persistent store."""
        collections = list(self._collections.values())
        self._collections.clear()
        for collection in collections:
            try:
                self._client.delete_collection(collection.name)
            except Exception:
                continue
        try:
            for collection in self._client.list_collections():
                if collection.name.startswith(f"{CHROMA_COLLECTION_NAME}__gen_"):
                    self._client.delete_collection(collection.name)
        except Exception:
            return

    def _serialize_record_metadata(
        self,
        record: dict[str, Any],
    ) -> dict[str, str | int | float | bool]:
        metadata: dict[str, str | int | float | bool] = {}
        for key in ("document_id", "document_revision_id", "space_id"):
            value = record.get(key)
            if isinstance(value, int):
                metadata[key] = value
        for key, value in (record.get("metadata") or {}).items():
            if value is None or isinstance(value, (str, int, float, bool)):
                if value is not None:
                    metadata[f"{METADATA_PREFIX}{key}"] = value
        return metadata

    def _build_record_from_metadata(
        self,
        record_id: str,
        text: str,
        metadata: dict,
        *,
        embedding: list | None = None,
        score: float | None = None,
    ) -> dict[str, Any]:
        """从 Chroma metadata 构建统一格式的 record dict。"""
        record: dict[str, Any] = {
            "id": record_id,
            "document_id": int(metadata["document_id"]),
            "document_revision_id": int(
                metadata.get("document_revision_id", metadata["document_id"])
            ),
            "space_id": int(metadata["space_id"])
            if "space_id" in metadata
            else int(metadata["knowledge_base_id"])
            if "knowledge_base_id" in metadata
            else None,
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


@cache
def _get_persistent_chroma_store(storage_path: str) -> PersistentChromaStore:
    """Cache one persistent store per configured Chroma path."""
    return PersistentChromaStore(Path(storage_path))


def get_chroma_store() -> PersistentChromaStore:
    """Return the persistent store configured for the current runtime settings."""
    settings = get_settings()
    return _get_persistent_chroma_store(str(settings.chroma_path))


def reset_chroma_store(
    *,
    clear_persisted: bool = False,
    storage_path: str | Path | None = None,
) -> None:
    """Reset the cached persistent store, optionally removing its on-disk data."""
    resolved_path = (
        Path(storage_path) if storage_path is not None else Path(get_settings().chroma_path)
    )
    store = _get_persistent_chroma_store(str(resolved_path))
    if clear_persisted:
        store.clear()
    _get_persistent_chroma_store.cache_clear()
