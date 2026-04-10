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


def merge_sources_by_key(
    current_sources: list[dict[str, Any]],
    new_sources: list[dict[str, Any]],
) -> list[dict[str, Any]]:
    merged: list[dict[str, Any]] = list(current_sources)
    seen = {
        (
            source.get("document_revision_id"),
            source.get("chunk_id"),
            source.get("snippet"),
        )
        for source in current_sources
    }
    for source in new_sources:
        key = (
            source.get("document_revision_id"),
            source.get("chunk_id"),
            source.get("snippet"),
        )
        if key in seen:
            continue
        seen.add(key)
        merged.append(source)
    return merged


def merge_workflow_sources(
    current: list[WorkflowSource],
    new: list[WorkflowSource],
) -> list[WorkflowSource]:
    seen = {(s.document_revision_id, s.chunk_id, s.snippet) for s in current}
    merged = list(current)
    for source in new:
        key = (source.document_revision_id, source.chunk_id, source.snippet)
        if key in seen:
            continue
        seen.add(key)
        merged.append(source)
    return merged
