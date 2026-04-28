from __future__ import annotations

from typing import TYPE_CHECKING

from pydantic_ai import Agent
from pydantic_ai.usage import UsageLimits

from knowledge_chatbox_api.services.chat.workflow.deps import ChatWorkflowDeps
from knowledge_chatbox_api.services.chat.workflow.instructions import (
    base_instructions,
    build_runtime_instructions,
)
from knowledge_chatbox_api.services.chat.workflow.output import ChatWorkflowResult
from knowledge_chatbox_api.services.chat.workflow.tools import (
    knowledge_search_tool,
    load_prompt_attachments_tool,
)

if TYPE_CHECKING:
    from pydantic_ai.models import Model


def build_chat_usage_limits() -> UsageLimits:
    return UsageLimits(request_limit=6, tool_calls_limit=4)


def _build_base_agent[OutputT](
    model: str | Model | None,
    *,
    output_type: type[OutputT],
) -> Agent[ChatWorkflowDeps, OutputT]:
    agent: Agent[ChatWorkflowDeps, OutputT] = Agent(
        model or "openai:gpt-5.4",
        deps_type=ChatWorkflowDeps,
        output_type=output_type,
        instructions=base_instructions(),
        defer_model_check=True,
        retries=2,
    )
    agent.instructions(build_runtime_instructions)
    agent.tool(knowledge_search_tool)
    agent.tool(load_prompt_attachments_tool)
    return agent


def build_chat_agent(
    model: str | Model | None = None,
) -> Agent[ChatWorkflowDeps, ChatWorkflowResult]:
    return _build_base_agent(model, output_type=ChatWorkflowResult)


def build_chat_stream_agent(
    model: str | Model | None = None,
) -> Agent[ChatWorkflowDeps, str]:
    return _build_base_agent(model, output_type=str)
