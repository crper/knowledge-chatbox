from typing import Any

from sqlalchemy import delete, insert, literal_column, select, text
from sqlalchemy.orm import Session

from knowledge_chatbox_api.models.retrieval_chunk import retrieval_chunks_fts
from knowledge_chatbox_api.utils.chroma import text_fallback_where_document_terms


def _escape_fts_term(term: str) -> str:
    return term.replace('"', '""')


def _build_match_query(query_text: str) -> str | None:
    terms = text_fallback_where_document_terms(query_text)
    if not terms:
        return None
    return " OR ".join(f'"{_escape_fts_term(term)}"' for term in terms)


def _score_from_bm25(rank: float | int | None) -> float:
    if rank is None:
        return 0.0
    return max(-float(rank), 0.0)


class RetrievalChunkRepository:
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
        if revision_ids:
            self.session.execute(
                delete(retrieval_chunks_fts).where(
                    retrieval_chunks_fts.c.generation == generation,
                    retrieval_chunks_fts.c.document_revision_id.in_(revision_ids),
                )
            )

        self.session.execute(
            insert(retrieval_chunks_fts),
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
            delete(retrieval_chunks_fts).where(
                retrieval_chunks_fts.c.generation == generation,
                retrieval_chunks_fts.c.document_revision_id == document_id,
            )
        )

    def clear_generation(self, generation: int) -> None:
        self.session.execute(
            delete(retrieval_chunks_fts).where(
                retrieval_chunks_fts.c.generation == generation,
            )
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

        from sqlalchemy import Select

        statement: Select[tuple[Any, ...]] = select(
            retrieval_chunks_fts.c.chunk_id,
            retrieval_chunks_fts.c.document_id,
            retrieval_chunks_fts.c.document_revision_id,
            retrieval_chunks_fts.c.space_id,
            retrieval_chunks_fts.c.page_number,
            retrieval_chunks_fts.c.section_title,
            retrieval_chunks_fts.c.content,
            literal_column("bm25(retrieval_chunks_fts)").label("rank"),
        ).where(
            text("retrieval_chunks_fts MATCH :match_query"),
            retrieval_chunks_fts.c.generation == generation,
        )
        params: dict[str, Any] = {
            "match_query": match_query,
        }

        if space_id is not None:
            statement = statement.where(retrieval_chunks_fts.c.space_id == space_id)

        if document_revision_ids:
            statement = statement.where(
                retrieval_chunks_fts.c.document_revision_id.in_(document_revision_ids)
            )

        statement = statement.order_by(literal_column("rank")).limit(top_k)

        rows = self.session.execute(statement, params).mappings().all()
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
