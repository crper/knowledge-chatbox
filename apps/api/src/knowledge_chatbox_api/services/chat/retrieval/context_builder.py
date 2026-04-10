from typing import Any

from sqlalchemy import select

from knowledge_chatbox_api.models.document import Document, DocumentRevision
from knowledge_chatbox_api.services.chat.retrieval.models import (
    RetrievalDiagnostics,
    RetrievedContext,
)
from knowledge_chatbox_api.utils.timing import elapsed_ms


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
            if not self._has_relevant_score(record):
                continue

            document_name = self._resolve_document_name(
                record, versions_by_id, documents_by_id, active_space_id
            )
            if document_name is None:
                continue

            context_section, source = self._build_record_output(record, document_name)
            context_sections.append(context_section)
            sources.append(source)

        return RetrievedContext(
            context_sections=context_sections,
            sources=sources,
            diagnostics=diagnostics,
        )

    def _has_relevant_score(self, record: dict[str, Any]) -> bool:
        score = record.get("score")
        if isinstance(score, (int, float)) and score < 0.1:
            return False
        return True

    def _resolve_document_name(
        self,
        record: dict[str, Any],
        versions_by_id: dict[int, DocumentRevision],
        documents_by_id: dict[int, Document],
        active_space_id: int | None,
    ) -> str | None:
        revision_id = record.get("document_revision_id", record["document_id"])
        document_version = versions_by_id.get(revision_id)

        if document_version is None:
            return f"Document {record['document_id']}"

        document = documents_by_id.get(document_version.document_id)
        if document is None:
            return f"Document {record['document_id']}"

        if not self._is_valid_document_version(document, document_version, active_space_id):
            return None

        return document.logical_name

    def _build_record_output(
        self, record: dict[str, Any], document_name: str
    ) -> tuple[str, dict[str, Any]]:
        metadata = record["metadata"]
        page_number = metadata.get("page_number")
        section_title = metadata.get("section_title")
        record_text = record["text"]
        revision_id = record.get("document_revision_id", record["document_id"])

        context_lines = [
            f"Document: {document_name}",
        ]
        if section_title:
            context_lines.append(f"Section: {section_title}")
        if page_number is not None:
            context_lines.append(f"Page: {page_number}")
        context_lines.append(f"Content: {record_text}")
        context_section = "\n".join(context_lines)

        source = {
            "document_id": record["document_id"],
            "document_revision_id": revision_id,
            "document_name": document_name,
            "chunk_id": record["id"],
            "snippet": record_text[:240],
            "page_number": page_number,
            "section_title": section_title,
            "score": record.get("score"),
        }

        return context_section, source

    def build_diagnostics(
        self,
        *,
        strategy: str,
        started_at: float,
        candidate_count: int,
        attachment_revision_scope_count: int,
    ) -> RetrievalDiagnostics:
        latency_ms = elapsed_ms(started_at)
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
