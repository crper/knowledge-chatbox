from typing import Any

from pydantic import BaseModel, Field


class WorkflowSource(BaseModel):
    document_id: int | None = None
    document_revision_id: int | None = None
    document_name: str | None = None
    chunk_id: str | None = None
    snippet: str = ""
    page_number: int | None = None
    section_title: str | None = None
    score: float | None = None


class ChatWorkflowResult(BaseModel):
    answer: str = Field(default="")
    sources: list[WorkflowSource] = Field(default_factory=list)


def _build_source_key(
    *,
    document_id: int | None,
    document_revision_id: int | None,
    document_name: str | None,
    chunk_id: str | None,
    page_number: int | None,
    section_title: str | None,
    snippet: str,
) -> tuple:
    normalized_chunk_id = chunk_id or None
    normalized_snippet = snippet.strip()
    if document_revision_id is not None and normalized_chunk_id is not None:
        return ("revision_chunk", document_revision_id, normalized_chunk_id, normalized_snippet)
    return (
        "fallback",
        document_id,
        document_revision_id,
        document_name,
        normalized_chunk_id,
        page_number,
        section_title,
        normalized_snippet,
    )


def _source_key(source: WorkflowSource) -> tuple:
    return _build_source_key(
        document_id=source.document_id,
        document_revision_id=source.document_revision_id,
        document_name=source.document_name,
        chunk_id=source.chunk_id,
        page_number=source.page_number,
        section_title=source.section_title,
        snippet=source.snippet,
    )


def merge_workflow_sources(
    current: list[WorkflowSource],
    new: list[WorkflowSource],
) -> list[WorkflowSource]:
    seen = {_source_key(s) for s in current}
    merged = list(current)
    for source in new:
        key = _source_key(source)
        if key in seen:
            continue
        seen.add(key)
        merged.append(source)
    return merged


def merge_sources_by_key(
    current_sources: list[dict[str, Any]],
    new_sources: list[dict[str, Any]],
) -> list[dict[str, Any]]:
    seen = {
        _build_source_key(
            document_id=s.get("document_id"),
            document_revision_id=s.get("document_revision_id"),
            document_name=s.get("document_name"),
            chunk_id=s.get("chunk_id"),
            page_number=s.get("page_number"),
            section_title=s.get("section_title"),
            snippet=str(s.get("snippet") or ""),
        )
        for s in current_sources
    }
    merged = list(current_sources)
    for source in new_sources:
        key = _build_source_key(
            document_id=source.get("document_id"),
            document_revision_id=source.get("document_revision_id"),
            document_name=source.get("document_name"),
            chunk_id=source.get("chunk_id"),
            page_number=source.get("page_number"),
            section_title=source.get("section_title"),
            snippet=str(source.get("snippet") or ""),
        )
        if key in seen:
            continue
        seen.add(key)
        merged.append(source)
    return merged
