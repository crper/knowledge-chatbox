from __future__ import annotations

from time import perf_counter
from typing import Any

from sqlalchemy import select

from knowledge_chatbox_api.models.document import Document, DocumentRevision
from knowledge_chatbox_api.services.chat.retrieval.models import (
    RetrievalDiagnostics,
    RetrievedContext,
)


class RetrievedContextBuilder:
    def __init__(self, *, session) -> None:
        self.session = session

    def empty_context(
        self,
        *,
        started_at: float,
        attachment_revision_scope_count: int,
        strategy: str = "none",
    ) -> RetrievedContext:
        return RetrievedContext(
            context_sections=[],
            sources=[],
            diagnostics=self.build_diagnostics(
                strategy=strategy,
                started_at=started_at,
                candidate_count=0,
                attachment_revision_scope_count=attachment_revision_scope_count,
            ),
        )

    def build_context(
        self,
        retrieved_chunks: list[dict[str, Any]],
        active_space_id: int | None,
        *,
        diagnostics: RetrievalDiagnostics,
    ) -> RetrievedContext:
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
                    document,
                    document_version,
                    active_space_id,
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

    def build_diagnostics(
        self,
        *,
        strategy: str,
        started_at: float,
        candidate_count: int,
        attachment_revision_scope_count: int,
    ) -> RetrievalDiagnostics:
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

    def _is_valid_document_version(
        self,
        document: Document,
        document_version: DocumentRevision,
        active_space_id: int | None,
    ) -> bool:
        if document.space_id != active_space_id:
            return False
        return (
            document.latest_revision_id == document_version.id
            or document.current_version_number == document_version.revision_no
        )
