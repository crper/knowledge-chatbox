from __future__ import annotations

import base64
import binascii
from typing import cast

from pydantic_ai.messages import BinaryContent, ModelRequest, ModelResponse, TextPart
from pydantic_ai.settings import ModelSettings

from knowledge_chatbox_api.services.chat.workflow.agent import (
    build_chat_agent,
    build_chat_stream_agent,
    build_chat_usage_limits,
)
from knowledge_chatbox_api.services.chat.workflow.model_factory import build_chat_agent_model
from knowledge_chatbox_api.services.chat.workflow.output import ChatWorkflowResult, WorkflowSource

PROMPT_HISTORY_MESSAGE_LIMIT = 4


class ChatWorkflow:
    def __init__(self, *, agent_model=None, stream_agent_model=None) -> None:
        self._agent_model = agent_model
        self._stream_agent_model = stream_agent_model

    def _build_agent(self, runtime_settings):
        model = self._agent_model or build_chat_agent_model(runtime_settings)
        return build_chat_agent(model=model)

    def _build_stream_agent(self, runtime_settings):
        model = self._stream_agent_model or build_chat_agent_model(runtime_settings)
        return build_chat_stream_agent(model=model)

    def _build_user_prompt(
        self,
        *,
        deps,
        session_id: int,
        question: str,
        attachments: list[dict] | None,
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
            f"session_id={session_id}\n"
            f"question={question}\n"
            f"attachments={attachments or []}\n"
            "当前回合附件已随用户消息直接提供。需要知识库上下文时调用 knowledge_search 工具。"
        ).strip()

        if not prompt_attachments:
            return prompt_body

        user_content: list[str | BinaryContent] = [prompt_body]
        user_content.extend(self._map_prompt_attachments(prompt_attachments))
        return user_content

    def _map_prompt_attachments(
        self,
        prompt_attachments: list[dict],
    ) -> list[str | BinaryContent]:
        user_content: list[str | BinaryContent] = []
        for item in prompt_attachments:
            if item.get("type") == "text":
                text = item.get("text")
                if isinstance(text, str) and text:
                    user_content.append(text)
                continue

            if item.get("type") != "image":
                continue

            data_base64 = item.get("data_base64")
            if not isinstance(data_base64, str) or not data_base64:
                continue

            mime_type = item.get("mime_type")
            if not isinstance(mime_type, str) or not mime_type:
                mime_type = "image/jpeg"

            try:
                image_bytes = base64.b64decode(data_base64, validate=True)
            except (binascii.Error, ValueError):
                continue

            user_content.append(BinaryContent(data=image_bytes, media_type=mime_type))

        return user_content

    def _build_message_history(
        self,
        deps,
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
        if history and history[-1].role == "assistant" and not (history[-1].content or "").strip():
            history.pop()
        if history and history[-1].role == "user" and history[-1].content == question:
            history.pop()

        message_history: list[ModelRequest | ModelResponse] = []
        for message in history:
            if message.role == "user":
                message_history.append(ModelRequest.user_text_prompt(message.content))
                continue
            if message.role == "assistant" and message.content:
                message_history.append(ModelResponse(parts=[TextPart(message.content)]))
        return message_history

    def _build_model_settings(self, runtime_settings) -> ModelSettings:
        route = runtime_settings.response_route
        reasoning_mode = getattr(runtime_settings, "reasoning_mode", "default")
        model_settings: dict[str, object] = {
            "timeout": getattr(runtime_settings, "provider_timeout_seconds", None),
        }

        if route.provider == "anthropic":
            if reasoning_mode == "on":
                model_settings["anthropic_thinking"] = {
                    "type": "enabled",
                    "budget_tokens": 1024,
                    "display": "omitted",
                }
            elif reasoning_mode == "off":
                model_settings["anthropic_thinking"] = {"type": "disabled"}
        elif route.provider == "ollama":
            model_settings["extra_body"] = {"think": reasoning_mode == "on"}
        elif reasoning_mode == "on":
            model_settings["openai_reasoning_effort"] = "medium"
        elif reasoning_mode == "off":
            model_settings["openai_reasoning_effort"] = "none"

        return cast(
            ModelSettings,
            {key: value for key, value in model_settings.items() if value is not None},
        )

    def _reset_workflow_state(self, deps) -> None:
        workflow_state = getattr(deps, "workflow_state", None)
        if isinstance(workflow_state, dict):
            workflow_state["retrieved_sources"] = []

    def _read_retrieved_sources(self, deps) -> list[WorkflowSource]:
        workflow_state = getattr(deps, "workflow_state", None)
        if not isinstance(workflow_state, dict):
            return []
        raw_sources = workflow_state.get("retrieved_sources", [])
        if not isinstance(raw_sources, list):
            return []
        return [WorkflowSource.model_validate(source) for source in raw_sources]

    def _merge_sources(
        self,
        retrieved_sources: list[WorkflowSource],
        output_sources: list[WorkflowSource],
    ) -> list[WorkflowSource]:
        merged: list[WorkflowSource] = []
        seen: set[tuple[int | None, str | None, str]] = set()
        for source in [*retrieved_sources, *output_sources]:
            validated = WorkflowSource.model_validate(source)
            key = (
                validated.document_revision_id,
                validated.chunk_id,
                validated.snippet,
            )
            if key in seen:
                continue
            seen.add(key)
            merged.append(validated)
        return merged

    def run_sync(
        self,
        *,
        deps,
        session_id: int,
        question: str,
        attachments: list[dict] | None,
    ):
        agent = self._build_agent(deps.runtime_settings)
        self._reset_workflow_state(deps)
        result = agent.run_sync(
            self._build_user_prompt(
                deps=deps,
                session_id=session_id,
                question=question,
                attachments=attachments,
            ),
            deps=deps,
            message_history=self._build_message_history(
                deps,
                session_id=session_id,
                question=question,
            ),
            model_settings=self._build_model_settings(deps.runtime_settings),
            usage_limits=build_chat_usage_limits(),
        )
        output = ChatWorkflowResult.model_validate(result.output)
        return output.model_copy(
            update={
                "sources": self._merge_sources(
                    self._read_retrieved_sources(deps),
                    output.sources,
                )
            }
        )

    def run_stream_events(
        self,
        *,
        deps,
        session_id: int,
        question: str,
        attachments: list[dict] | None,
    ):
        agent = self._build_stream_agent(deps.runtime_settings)
        self._reset_workflow_state(deps)
        return agent.run_stream_events(
            self._build_user_prompt(
                deps=deps,
                session_id=session_id,
                question=question,
                attachments=attachments,
            ),
            deps=deps,
            message_history=self._build_message_history(
                deps,
                session_id=session_id,
                question=question,
            ),
            model_settings=self._build_model_settings(deps.runtime_settings),
            usage_limits=build_chat_usage_limits(),
        )
