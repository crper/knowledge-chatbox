from __future__ import annotations

from types import SimpleNamespace
from typing import Any, cast

import pytest
from pydantic_ai import AgentRunResultEvent
from pydantic_ai.messages import BinaryContent, ModelRequest, ModelResponse, TextPart
from pydantic_ai.models.test import TestModel
from tests.fixtures.dummies import (
    DummyChatRepository,
    DummyMessage,
    DummyPromptAttachmentService,
    DummyRuntimeSettings,
)

from knowledge_chatbox_api.models.enums import ChatAttachmentType, ReasoningMode
from knowledge_chatbox_api.schemas.chat import ChatAttachmentMetadata, PromptAttachmentItem
from knowledge_chatbox_api.services.chat.workflow.chat_workflow import ChatWorkflow
from knowledge_chatbox_api.services.chat.workflow.deps import ChatWorkflowDeps
from knowledge_chatbox_api.services.chat.workflow.instructions import build_runtime_instructions
from knowledge_chatbox_api.services.chat.workflow.output import ChatWorkflowResult


def build_deps(
    *,
    runtime_settings: DummyRuntimeSettings | None = None,
    recent_messages: list[DummyMessage] | None = None,
    prompt_attachment_service: DummyPromptAttachmentService | None = None,
    space_id: int | None = None,
) -> ChatWorkflowDeps:
    return ChatWorkflowDeps(
        session_id=1,
        chat_repository=DummyChatRepository(recent_messages, space_id=space_id),
        retrieval_service=SimpleNamespace(),
        prompt_attachment_service=prompt_attachment_service or DummyPromptAttachmentService(),
        runtime_settings=runtime_settings or DummyRuntimeSettings(),
        request_metadata={"path": "sync"},
    )


@pytest.mark.filterwarnings("ignore:There is no current event loop:DeprecationWarning")
def test_chat_workflow_run_sync_returns_structured_result() -> None:
    workflow = ChatWorkflow(
        agent_model=TestModel(
            call_tools=[],
            custom_output_args={"answer": "测试回答", "sources": []},
        )
    )

    result = workflow.run_sync(
        deps=build_deps(),
        session_id=1,
        question="帮我总结一下",
        attachments=None,
    )

    assert result.answer == "测试回答"
    assert result.sources == []


async def test_chat_workflow_run_stream_events_yields_text_and_result_event() -> None:
    workflow = ChatWorkflow(
        stream_agent_model=TestModel(
            call_tools=[],
            custom_output_text="hello world",
        )
    )

    events = [
        event
        async for event in workflow.run_stream_events(
            deps=build_deps(),
            session_id=1,
            question="帮我总结一下",
            attachments=None,
        )
    ]

    assert any(type(event).__name__ == "PartDeltaEvent" for event in events)
    assert isinstance(events[-1], AgentRunResultEvent)


def test_chat_workflow_run_sync_passes_history_and_model_settings(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    captured: dict[str, object] = {}

    class RuntimeSettings(DummyRuntimeSettings):
        reasoning_mode: ReasoningMode = ReasoningMode.ON
        provider_timeout_seconds: int = 12

    class CapturingAgent:
        def run_sync(self, user_prompt, **kwargs):
            captured["user_prompt"] = user_prompt
            captured["message_history"] = kwargs.get("message_history")
            captured["model_settings"] = kwargs.get("model_settings")
            return SimpleNamespace(output=ChatWorkflowResult(answer="捕获成功", sources=[]))

    recent_messages = [
        DummyMessage(role="user", content="第一轮问题"),
        DummyMessage(role="assistant", content="第一轮回答"),
        DummyMessage(role="user", content="继续刚才的话题"),
        DummyMessage(role="assistant", content=""),
    ]
    workflow = ChatWorkflow()
    monkeypatch.setattr(workflow, "_build_agent", lambda _runtime_settings: CapturingAgent())

    result = workflow.run_sync(
        deps=build_deps(runtime_settings=RuntimeSettings(), recent_messages=recent_messages),
        session_id=1,
        question="继续刚才的话题",
        attachments=None,
    )

    assert result.answer == "捕获成功"
    assert captured["user_prompt"] == (
        "继续刚才的话题\n\n"
        "question=继续刚才的话题\n"
        "当前回合附件已随用户消息直接提供。需要知识库上下文时调用 knowledge_search 工具。"
    )
    assert captured["model_settings"] == {
        "openai_reasoning_effort": "medium",
        "timeout": 12,
    }
    message_history = captured["message_history"]
    assert isinstance(message_history, list)
    assert len(message_history) == 2
    assert isinstance(message_history[0], ModelRequest)
    assert isinstance(message_history[1], ModelResponse)
    assert message_history[0].parts[0].content == "第一轮问题"
    assert isinstance(message_history[1].parts[0], TextPart)
    assert message_history[1].parts[0].content == "第一轮回答"


def test_chat_workflow_passes_multimodal_user_prompt_when_image_attachments_exist(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    captured: dict[str, object] = {}

    class ImagePromptAttachmentService(DummyPromptAttachmentService):
        def build_prompt_attachments(self, attachments, active_space_id: int | None):
            assert len(attachments) == 1
            assert attachments[0].type == ChatAttachmentType.IMAGE
            assert attachments[0].document_revision_id == 9
            assert active_space_id == 77
            return [
                PromptAttachmentItem(
                    type="image",
                    mime_type="image/jpeg",
                    data_base64="aGVsbG8=",
                )
            ]

        def resolve_prompt_text(self, question: str, attachments):
            assert question == ""
            assert len(attachments) == 1
            assert attachments[0].type == ChatAttachmentType.IMAGE
            assert attachments[0].document_revision_id == 9
            return "Analyze the attached image."

    class CapturingAgent:
        def run_sync(self, user_prompt, **_kwargs):
            captured["user_prompt"] = user_prompt
            return SimpleNamespace(output=ChatWorkflowResult(answer="已捕获", sources=[]))

    workflow = ChatWorkflow()
    monkeypatch.setattr(workflow, "_build_agent", lambda _runtime_settings: CapturingAgent())

    result = workflow.run_sync(
        deps=build_deps(
            prompt_attachment_service=ImagePromptAttachmentService(),
            space_id=77,
        ),
        session_id=1,
        question="",
        attachments=[
            ChatAttachmentMetadata(
                attachment_id="test-1",
                type=ChatAttachmentType.IMAGE,
                name="test.png",
                mime_type="image/png",
                size_bytes=100,
                document_revision_id=9,
            )
        ],
    )

    assert result.answer == "已捕获"
    user_prompt = captured["user_prompt"]
    assert isinstance(user_prompt, list)
    assert user_prompt[0].startswith("Analyze the attached image.")
    assert isinstance(user_prompt[1], BinaryContent)
    assert user_prompt[1].data == b"hello"
    assert user_prompt[1].media_type == "image/jpeg"


def test_runtime_instructions_include_configured_system_prompt() -> None:
    runtime_settings = DummyRuntimeSettings(system_prompt="请优先输出结论。")

    instructions = build_runtime_instructions(
        cast(
            "Any",
            SimpleNamespace(
                deps=build_deps(runtime_settings=cast("Any", runtime_settings)),
            ),
        )
    )

    assert instructions == "请优先输出结论。\n当前 response provider=openai, model=gpt-5.4."
