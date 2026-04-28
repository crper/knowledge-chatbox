from __future__ import annotations

import base64
import binascii
from typing import TYPE_CHECKING

from pydantic_ai.messages import BinaryContent, ModelRequest, ModelResponse, TextPart
from pydantic_ai.settings import ModelSettings

from knowledge_chatbox_api.models.enums import ChatAttachmentType, ChatMessageRole
from knowledge_chatbox_api.providers.base import build_reasoning_config
from knowledge_chatbox_api.services.chat import PROMPT_HISTORY_MESSAGE_LIMIT
from knowledge_chatbox_api.services.chat.workflow.agent import (
    build_chat_agent,
    build_chat_stream_agent,
    build_chat_usage_limits,
)
from knowledge_chatbox_api.services.chat.workflow.model_factory import build_chat_agent_model
from knowledge_chatbox_api.services.chat.workflow.output import (
    ChatWorkflowResult,
    merge_workflow_sources,
)

if TYPE_CHECKING:
    from pydantic_ai.models import Model

    from knowledge_chatbox_api.schemas.chat import ChatAttachmentMetadata, PromptAttachmentItem
    from knowledge_chatbox_api.schemas.settings import ProviderRuntimeSettings
    from knowledge_chatbox_api.services.chat.workflow.deps import ChatWorkflowDeps


class ChatWorkflow:
    """聊天执行 owner，负责构建 agent、组装 user prompt 与消息历史、执行同步和流式问答。

    同步问答走 ``run_sync``，流式问答走 ``run_stream_events``；两者共享同一套
    PydanticAI agent 构建逻辑和消息历史组装逻辑。

    构造参数 ``agent_model`` / ``stream_agent_model`` 用于测试注入自定义 model；
    生产环境下默认通过 ``build_chat_agent_model`` 从当前 ``ProviderRuntimeSettings``
    构建真实 model 实例。
    """

    def __init__(
        self,
        *,
        agent_model: str | Model | None = None,
        stream_agent_model: str | Model | None = None,
    ) -> None:
        self._agent_model = agent_model
        self._stream_agent_model = stream_agent_model

    def _build_agent(
        self,
        runtime_settings: ProviderRuntimeSettings,
        *,
        stream: bool = False,
    ):
        model = (
            (self._stream_agent_model if stream else None)
            or self._agent_model
            or build_chat_agent_model(runtime_settings)
        )
        return build_chat_stream_agent(model=model) if stream else build_chat_agent(model=model)

    def _build_user_prompt(
        self,
        *,
        deps: ChatWorkflowDeps,
        session_id: int,
        question: str,
        attachments: list[ChatAttachmentMetadata] | None,
    ) -> str | list[str | BinaryContent]:
        chat_session = deps.chat_repository.get_session(session_id)
        active_space_id = chat_session.space_id if chat_session is not None else None
        prompt_attachments = deps.prompt_attachment_service.build_prompt_attachments(
            attachments,
            active_space_id,
        )
        prompt_text = deps.prompt_attachment_service.resolve_prompt_text(question, attachments)
        prompt_body = (
            f"{prompt_text}\n\n"
            f"question={question}\n"
            "当前回合附件已随用户消息直接提供。需要知识库上下文时调用 knowledge_search 工具。"
        ).strip()

        if not prompt_attachments:
            return prompt_body

        user_content: list[str | BinaryContent] = [prompt_body]
        user_content.extend(self._map_prompt_attachments(prompt_attachments))
        return user_content

    def _map_prompt_attachments(
        self,
        prompt_attachments: list[PromptAttachmentItem],
    ) -> list[str | BinaryContent]:
        return [
            c
            for item in prompt_attachments
            if (c := self._convert_attachment_item(item)) is not None
        ]

    def _convert_attachment_item(self, item: PromptAttachmentItem) -> str | BinaryContent | None:
        if item.type == "text":
            return item.text if item.text else None

        if item.type == ChatAttachmentType.IMAGE:
            return self._convert_image_attachment(item)

        return None

    def _convert_image_attachment(self, item: PromptAttachmentItem) -> BinaryContent | None:
        if not item.data_base64:
            return None

        mime_type = item.mime_type or "image/jpeg"

        try:
            image_bytes = base64.b64decode(item.data_base64, validate=True)
        except (binascii.Error, ValueError):
            return None

        return BinaryContent(data=image_bytes, media_type=mime_type)

    def _build_message_history(
        self,
        deps: ChatWorkflowDeps,
        *,
        session_id: int,
        question: str,
    ) -> list[ModelRequest | ModelResponse]:
        history = list(
            deps.chat_repository.list_recent_messages(
                session_id,
                limit=PROMPT_HISTORY_MESSAGE_LIMIT,
            )
        )
        if (
            history
            and history[-1].role == ChatMessageRole.ASSISTANT
            and not (history[-1].content or "").strip()
        ):
            history.pop()
        if (
            history
            and history[-1].role == ChatMessageRole.USER
            and (history[-1].content or "") == question
        ):
            history.pop()

        message_history: list[ModelRequest | ModelResponse] = []
        for message in history:
            if message.role == ChatMessageRole.USER:
                message_history.append(ModelRequest.user_text_prompt(message.content))
                continue
            if message.role == ChatMessageRole.ASSISTANT and message.content:
                message_history.append(ModelResponse(parts=[TextPart(message.content)]))
        return message_history

    def _build_model_settings(self, runtime_settings: ProviderRuntimeSettings) -> ModelSettings:
        route = runtime_settings.response_route

        timeout = runtime_settings.provider_timeout_seconds

        reasoning_config = build_reasoning_config(route.provider, runtime_settings.reasoning_mode)

        return ModelSettings(timeout=timeout, **reasoning_config)

    def _prepare_workflow(
        self,
        deps: ChatWorkflowDeps,
        *,
        session_id: int,
        question: str,
        attachments: list[ChatAttachmentMetadata] | None,
    ):
        deps.retrieved_sources.clear()
        prompt = self._build_user_prompt(
            deps=deps,
            session_id=session_id,
            question=question,
            attachments=attachments,
        )
        history = self._build_message_history(
            deps,
            session_id=session_id,
            question=question,
        )
        settings = self._build_model_settings(deps.runtime_settings)
        return prompt, history, settings

    def run_sync(
        self,
        *,
        deps: ChatWorkflowDeps,
        session_id: int,
        question: str,
        attachments: list[ChatAttachmentMetadata] | None,
    ) -> ChatWorkflowResult:
        """Execute synchronous chat workflow.

        Args:
            deps: Workflow dependencies including repositories and services
            session_id: Target chat session ID
            question: User's question text
            attachments: Optional list of attachment metadata

        Returns:
            ChatWorkflowResult containing the response and sources
        """
        agent = self._build_agent(deps.runtime_settings)
        prompt, history, settings = self._prepare_workflow(
            deps, session_id=session_id, question=question, attachments=attachments
        )
        result = agent.run_sync(
            prompt,
            deps=deps,
            message_history=history,
            model_settings=settings,
            usage_limits=build_chat_usage_limits(),
        )
        output = ChatWorkflowResult.model_validate(result.output)
        return output.model_copy(
            update={
                "sources": merge_workflow_sources(
                    list(deps.retrieved_sources),
                    output.sources,
                )
            }
        )

    def run_stream_events(
        self,
        *,
        deps: ChatWorkflowDeps,
        session_id: int,
        question: str,
        attachments: list[ChatAttachmentMetadata] | None,
    ):
        """Execute streaming chat workflow with server-sent events.

        Args:
            deps: Workflow dependencies including repositories and services
            session_id: Target chat session ID
            question: User's question text
            attachments: Optional list of attachment metadata

        Returns:
            Async iterator of stream events for SSE response
        """
        agent = self._build_agent(deps.runtime_settings, stream=True)
        prompt, history, settings = self._prepare_workflow(
            deps, session_id=session_id, question=question, attachments=attachments
        )
        return agent.run_stream_events(
            prompt,
            deps=deps,
            message_history=history,
            model_settings=settings,
            usage_limits=build_chat_usage_limits(),
        )
