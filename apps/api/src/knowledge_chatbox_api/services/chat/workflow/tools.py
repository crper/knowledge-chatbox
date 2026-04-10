from pydantic import BaseModel, Field
from pydantic_ai import RunContext

from knowledge_chatbox_api.services.chat.workflow.deps import ChatWorkflowDeps
from knowledge_chatbox_api.services.chat.workflow.output import (
    WorkflowSource,
    merge_workflow_sources,
)


class KnowledgeSearchOutput(BaseModel):
    context_sections: list[str] = Field(default_factory=list)
    sources: list[WorkflowSource] = Field(default_factory=list)


class PromptAttachmentsOutput(BaseModel):
    prompt_text: str
    attachments: list[dict] = Field(default_factory=list)


async def knowledge_search_tool(
    ctx: RunContext[ChatWorkflowDeps],
    query: str,
    attachments: list[dict] | None = None,
) -> KnowledgeSearchOutput:
    chat_session = ctx.deps.chat_repository.get_session(ctx.deps.session_id)
    active_space_id = chat_session.space_id if chat_session is not None else None
    retrieved = ctx.deps.retrieval_service.retrieve_context(
        query,
        active_space_id=active_space_id,
        attachments=attachments,
    )
    output = KnowledgeSearchOutput(
        context_sections=list(retrieved.context_sections),
        sources=[WorkflowSource.model_validate(item) for item in retrieved.sources],
    )
    ctx.deps.retrieved_sources.extend(
        merge_workflow_sources(
            [],
            output.sources,
        )
    )
    return output


async def load_prompt_attachments_tool(
    ctx: RunContext[ChatWorkflowDeps],
    question: str,
    attachments: list[dict] | None = None,
) -> PromptAttachmentsOutput:
    chat_session = ctx.deps.chat_repository.get_session(ctx.deps.session_id)
    active_space_id = chat_session.space_id if chat_session is not None else None
    prompt_attachments = ctx.deps.prompt_attachment_service.build_prompt_attachments(
        attachments,
        active_space_id,
    )
    prompt_text = ctx.deps.prompt_attachment_service.resolve_prompt_text(question, attachments)
    return PromptAttachmentsOutput(prompt_text=prompt_text, attachments=prompt_attachments)
