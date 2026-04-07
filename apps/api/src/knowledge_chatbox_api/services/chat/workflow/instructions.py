from __future__ import annotations

from pydantic_ai import RunContext

from knowledge_chatbox_api.services.chat.workflow.deps import ChatWorkflowDeps


def base_instructions() -> str:
    return (
        "优先回答用户真正的问题。"
        "需要知识库上下文时调用 knowledge_search 工具。"
        "当前回合附件会随用户消息直接提供。"
        "只有确认服务端回填的附件内容时，才调用 load_prompt_attachments 工具。"
    )


def build_runtime_instructions(ctx: RunContext[ChatWorkflowDeps]) -> str:
    route = ctx.deps.runtime_settings.response_route
    system_prompt = (getattr(ctx.deps.runtime_settings, "system_prompt", None) or "").strip()
    suffix = f"当前 response provider={route.provider}, model={route.model}."
    if not system_prompt:
        return suffix
    return f"{system_prompt}\n{suffix}"
