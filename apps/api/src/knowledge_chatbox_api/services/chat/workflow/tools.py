"""聊天工作流工具函数定义。"""

from pydantic import BaseModel, Field
from pydantic_ai import RunContext

from knowledge_chatbox_api.schemas.chat import ChatAttachmentMetadata, PromptAttachmentItem
from knowledge_chatbox_api.services.chat.workflow.deps import ChatWorkflowDeps
from knowledge_chatbox_api.services.chat.workflow.output import (
    WorkflowSource,
)


class KnowledgeSearchOutput(BaseModel):
    """知识检索工具的返回结果。"""

    context_sections: list[str] = Field(default_factory=list)
    sources: list[WorkflowSource] = Field(default_factory=list)


class PromptAttachmentsOutput(BaseModel):
    """附件加载工具的返回结果。"""

    prompt_text: str
    attachments: list[PromptAttachmentItem] = Field(default_factory=list)


async def knowledge_search_tool(
    ctx: RunContext[ChatWorkflowDeps],
    query: str,
    attachments: list[ChatAttachmentMetadata] | None = None,
) -> KnowledgeSearchOutput:
    """知识检索工具：检索与查询相关的文档内容。

    流程：
    1. 获取当前聊天会话的space_id
    2. 调用retrieval_service执行向量检索
    3. 返回检索到的上下文片段和来源列表
    4. 将来源合并到工作流的retrieved_sources中

    Args:
        ctx: Pydantic AI运行上下文，包含依赖注入
        query: 用户查询文本
        attachments: 可选的附件列表，用于限定检索范围

    Returns:
        KnowledgeSearchOutput: 包含上下文片段和来源列表
    """
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
    ctx.deps.retrieved_sources.extend(output.sources)
    return output


async def load_prompt_attachments_tool(
    ctx: RunContext[ChatWorkflowDeps],
    question: str,
    attachments: list[ChatAttachmentMetadata] | None = None,
) -> PromptAttachmentsOutput:
    """附件加载工具：将附件内容加载为prompt上下文。

    流程：
    1. 获取当前聊天会话的space_id
    2. 构建附件的prompt表示（文本、图像等）
    3. 解析question中的附件引用，生成完整prompt

    Args:
        ctx: Pydantic AI运行上下文
        question: 用户问题
        attachments: 需要加载的附件列表

    Returns:
        PromptAttachmentsOutput: 包含解析后的prompt文本和附件信息
    """
    chat_session = ctx.deps.chat_repository.get_session(ctx.deps.session_id)
    active_space_id = chat_session.space_id if chat_session is not None else None
    prompt_attachments = ctx.deps.prompt_attachment_service.build_prompt_attachments(
        attachments,
        active_space_id,
    )
    prompt_text = ctx.deps.prompt_attachment_service.resolve_prompt_text(question, attachments)
    return PromptAttachmentsOutput(prompt_text=prompt_text, attachments=prompt_attachments)
