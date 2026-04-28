from typing import Any

from pydantic import BaseModel, ConfigDict, Field


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


class SourceKey(BaseModel):
    """来源去重键，用于合并时判断重复。"""

    model_config = ConfigDict(frozen=True)

    kind: str
    document_id: int | None = None
    document_revision_id: int | None = None
    document_name: str | None = None
    chunk_id: str | None = None
    page_number: int | None = None
    section_title: str | None = None
    snippet: str

    def __hash__(self) -> int:
        return hash(self.model_dump_json())


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
        return SourceKey(
            kind="revision_chunk",
            document_revision_id=source.document_revision_id,
            chunk_id=normalized_chunk_id,
            snippet=normalized_snippet,
        )
    return SourceKey(
        kind="fallback",
        document_id=source.document_id,
        document_revision_id=source.document_revision_id,
        document_name=source.document_name,
        chunk_id=normalized_chunk_id,
        page_number=source.page_number,
        section_title=source.section_title,
        snippet=normalized_snippet,
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
