"""SQLite FTS5-backed lexical retrieval side index."""

from __future__ import annotations

from typing import Any

from sqlalchemy import text
from sqlalchemy.orm import Session

from knowledge_chatbox_api.utils.chroma import _text_fallback_where_document_terms

LEXICAL_INDEX_TABLE = "retrieval_chunks_fts"


def _escape_fts_term(term: str) -> str:
    return term.replace('"', '""')


def _build_match_query(query_text: str) -> str | None:
    terms = _text_fallback_where_document_terms(query_text)
    if not terms:
        return None
    return " OR ".join(f'"{_escape_fts_term(term)}"' for term in terms)


def _score_from_bm25(rank: float | int | None) -> float:
    if rank is None:
        return 0.0
    return 1.0 / (1.0 + abs(float(rank)))


class RetrievalChunkRepository:
    """Manage the SQLite lexical side index used by retrieval fallback."""

    def __init__(self, session: Session) -> None:
        self.session = session

    def upsert_records(
        self,
        records: list[dict[str, Any]],
        *,
        generation: int,
    ) -> None:
        if not records:
            return

        revision_ids = {
            int(record["document_revision_id"])
            for record in records
            if isinstance(record.get("document_revision_id"), int)
        }
        for revision_id in revision_ids:
            self.delete_by_document_id(revision_id, generation=generation)

        self.session.execute(
            text(
                """
                INSERT INTO retrieval_chunks_fts (
                    generation,
                    chunk_id,
                    document_revision_id,
                    document_id,
                    space_id,
                    page_number,
                    section_title,
                    content
                ) VALUES (
                    :generation,
                    :chunk_id,
                    :document_revision_id,
                    :document_id,
                    :space_id,
                    :page_number,
                    :section_title,
                    :content
                )
                """
            ),
            [
                {
                    "generation": generation,
                    "chunk_id": record["id"],
                    "document_revision_id": record["document_revision_id"],
                    "document_id": record["document_id"],
                    "space_id": record.get("space_id"),
                    "page_number": (record.get("metadata") or {}).get("page_number"),
                    "section_title": (record.get("metadata") or {}).get("section_title"),
                    "content": record["text"],
                }
                for record in records
            ],
        )

    def delete_by_document_id(self, document_id: int, *, generation: int) -> None:
        self.session.execute(
            text(
                """
                DELETE FROM retrieval_chunks_fts
                WHERE generation = :generation
                  AND document_revision_id = :document_revision_id
                """
            ),
            {
                "generation": generation,
                "document_revision_id": document_id,
            },
        )

    def clear_generation(self, generation: int) -> None:
        self.session.execute(
            text("DELETE FROM retrieval_chunks_fts WHERE generation = :generation"),
            {"generation": generation},
        )

    def query(
        self,
        query_text: str,
        *,
        generation: int,
        top_k: int,
        space_id: int | None = None,
        document_revision_ids: list[int] | None = None,
    ) -> list[dict[str, Any]]:
        if top_k <= 0:
            return []

        match_query = _build_match_query(query_text)
        if match_query is None:
            return []

        sql_parts = [
            """
            SELECT
                chunk_id,
                document_id,
                document_revision_id,
                space_id,
                page_number,
                section_title,
                content,
                bm25(retrieval_chunks_fts) AS rank
            FROM retrieval_chunks_fts
            WHERE retrieval_chunks_fts MATCH :match_query
              AND generation = :generation
            """
        ]
        params: dict[str, Any] = {
            "generation": generation,
            "limit": top_k,
            "match_query": match_query,
        }

        if space_id is not None:
            sql_parts.append("AND space_id = :space_id")
            params["space_id"] = space_id

        if document_revision_ids:
            placeholders: list[str] = []
            for index, revision_id in enumerate(document_revision_ids):
                key = f"revision_id_{index}"
                placeholders.append(f":{key}")
                params[key] = revision_id
            sql_parts.append(f"AND document_revision_id IN ({', '.join(placeholders)})")

        sql_parts.append("ORDER BY rank LIMIT :limit")

        rows = self.session.execute(text("\n".join(sql_parts)), params).mappings().all()
        return [
            {
                "id": row["chunk_id"],
                "document_id": row["document_id"],
                "document_revision_id": row["document_revision_id"],
                "space_id": row["space_id"],
                "text": row["content"],
                "metadata": {
                    "page_number": row["page_number"],
                    "section_title": row["section_title"],
                },
                "score": _score_from_bm25(row["rank"]),
            }
            for row in rows
        ]
