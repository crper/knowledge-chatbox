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


SourceKey = tuple[
    str,
    int | None,
    int | None,
    str | None,
    str | None,
    int | None,
    str | None,
    str,
]


def normalize_chat_workflow_result(
    output: ChatWorkflowResult | dict[str, Any] | str,
) -> ChatWorkflowResult:
    if isinstance(output, ChatWorkflowResult):
        return output
    if isinstance(output, str):
        return ChatWorkflowResult(answer=output)
    return ChatWorkflowResult.model_validate(output)


def _source_key(source: WorkflowSource) -> SourceKey:
    normalized_chunk_id = source.chunk_id or None
    normalized_snippet = source.snippet.strip()
    if source.document_revision_id is not None and normalized_chunk_id is not None:
        return (
            "revision_chunk",
            None,
            source.document_revision_id,
            None,
            normalized_chunk_id,
            None,
            None,
            normalized_snippet,
        )
    return (
        "fallback",
        source.document_id,
        source.document_revision_id,
        source.document_name,
        normalized_chunk_id,
        source.page_number,
        source.section_title,
        normalized_snippet,
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


def _dict_to_workflow_source(s: dict[str, Any]) -> WorkflowSource:
    return WorkflowSource(
        document_id=s.get("document_id"),
        document_revision_id=s.get("document_revision_id"),
        document_name=s.get("document_name"),
        chunk_id=s.get("chunk_id"),
        page_number=s.get("page_number"),
        section_title=s.get("section_title"),
        snippet=str(s.get("snippet") or ""),
        score=s.get("score"),
    )


def merge_sources_by_key(
    current_sources: list[dict[str, Any]],
    new_sources: list[dict[str, Any]],
) -> list[dict[str, Any]]:
    current_workflow = [_dict_to_workflow_source(s) for s in current_sources]
    new_workflow = [_dict_to_workflow_source(s) for s in new_sources]
    merged = merge_workflow_sources(current_workflow, new_workflow)
    return [source.model_dump() for source in merged]
