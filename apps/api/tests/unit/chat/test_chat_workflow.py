from __future__ import annotations

import asyncio
from types import SimpleNamespace

from pydantic_ai import AgentRunResultEvent
from pydantic_ai.messages import ModelRequest, ModelResponse, TextPart
from pydantic_ai.models.test import TestModel

from knowledge_chatbox_api.services.chat.workflow.chat_workflow import ChatWorkflow
from knowledge_chatbox_api.services.chat.workflow.deps import ChatWorkflowDeps
from knowledge_chatbox_api.services.chat.workflow.instructions import build_runtime_instructions
from knowledge_chatbox_api.services.chat.workflow.output import ChatWorkflowResult


class DummyRoute:
    def __init__(self, provider: str, model: str) -> None:
        self.provider = provider
        self.model = model


class DummyProfiles:
    class OpenAI:
        api_key = "sk-openai"
        base_url = "https://api.openai.com/v1"

    openai = OpenAI()


class DummyRuntimeSettings:
    provider_profiles = DummyProfiles()
    response_route = DummyRoute("openai", "gpt-5.4")
    reasoning_mode = "default"
    provider_timeout_seconds = 60
    system_prompt = None


class DummyMessage:
    def __init__(self, role: str, content: str) -> None:
        self.role = role
        self.content = content


class DummyChatRepository:
    def __init__(self, recent_messages: list[DummyMessage] | None = None) -> None:
        self._recent_messages = list(recent_messages or [])

    def list_recent_messages(self, session_id: int, *, limit: int):
        assert session_id == 1
        assert limit == 4
        return list(self._recent_messages)


class DummyPromptAttachmentService:
    def resolve_prompt_text(self, question: str, attachments):
        del attachments
        return question


def build_deps(
    *,
    runtime_settings: DummyRuntimeSettings | None = None,
    recent_messages: list[DummyMessage] | None = None,
) -> ChatWorkflowDeps:
    return ChatWorkflowDeps(
        session=object(),
        actor=object(),
        chat_repository=DummyChatRepository(recent_messages),
        chat_run_repository=object(),
        chat_run_event_repository=object(),
        retrieval_service=object(),
        prompt_attachment_service=DummyPromptAttachmentService(),
        runtime_settings=runtime_settings or DummyRuntimeSettings(),
        request_metadata={"path": "sync"},
    )


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


def test_chat_workflow_run_sync_keeps_retrieved_sources_when_model_output_omits_them(
    monkeypatch,
) -> None:
    retrieved_source = {
        "document_id": 7,
        "document_revision_id": 11,
        "document_name": "playbook.md",
        "chunk_id": "chunk-1",
        "snippet": "retrieved snippet",
        "page_number": None,
        "section_title": "Intro",
        "score": 0.82,
    }

    class CapturingAgent:
        def run_sync(self, user_prompt, **kwargs):
            del user_prompt
            kwargs["deps"].workflow_state["retrieved_sources"] = [retrieved_source]
            return SimpleNamespace(output=ChatWorkflowResult(answer="测试回答", sources=[]))

    workflow = ChatWorkflow()
    monkeypatch.setattr(workflow, "_build_agent", lambda _runtime_settings: CapturingAgent())

    deps = SimpleNamespace(
        chat_repository=DummyChatRepository(),
        prompt_attachment_service=DummyPromptAttachmentService(),
        runtime_settings=DummyRuntimeSettings(),
        workflow_state={},
    )

    result = workflow.run_sync(
        deps=deps,
        session_id=1,
        question="帮我总结一下",
        attachments=None,
    )

    assert result.answer == "测试回答"
    assert [source.model_dump() for source in result.sources] == [retrieved_source]


def test_chat_workflow_run_stream_events_yields_text_and_result_event() -> None:
    workflow = ChatWorkflow(
        stream_agent_model=TestModel(
            call_tools=[],
            custom_output_text="hello world",
        )
    )

    async def collect_events():
        events = []
        async for event in workflow.run_stream_events(
            deps=build_deps(),
            session_id=1,
            question="帮我总结一下",
            attachments=None,
        ):
            events.append(event)
        return events

    events = asyncio.run(collect_events())

    assert any(type(event).__name__ == "PartDeltaEvent" for event in events)
    assert isinstance(events[-1], AgentRunResultEvent)


def test_chat_workflow_run_sync_passes_history_and_model_settings(
    monkeypatch,
) -> None:
    captured: dict[str, object] = {}

    class RuntimeSettings(DummyRuntimeSettings):
        reasoning_mode = "on"
        provider_timeout_seconds = 12

    class CapturingAgent:
        def run_sync(self, user_prompt, **kwargs):
            captured["user_prompt"] = user_prompt
            captured["message_history"] = kwargs.get("message_history")
            captured["model_settings"] = kwargs.get("model_settings")
            return SimpleNamespace(output=ChatWorkflowResult(answer="捕获成功", sources=[]))

    recent_messages = [
        DummyMessage("user", "第一轮问题"),
        DummyMessage("assistant", "第一轮回答"),
        DummyMessage("user", "继续刚才的话题"),
        DummyMessage("assistant", ""),
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
        "session_id=1\nquestion=继续刚才的话题\nattachments=[]\n请在必要时调用工具后给出最终答案。"
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


def test_chat_workflow_builds_provider_specific_model_settings() -> None:
    workflow = ChatWorkflow()

    anthropic_settings = SimpleNamespace(
        response_route=DummyRoute("anthropic", "claude-sonnet"),
        reasoning_mode="on",
        provider_timeout_seconds=45,
    )
    ollama_settings = SimpleNamespace(
        response_route=DummyRoute("ollama", "qwen3"),
        reasoning_mode="off",
        provider_timeout_seconds=21,
    )

    assert workflow._build_model_settings(anthropic_settings) == {
        "anthropic_thinking": {
            "type": "enabled",
            "budget_tokens": 1024,
            "display": "omitted",
        },
        "timeout": 45,
    }
    assert workflow._build_model_settings(ollama_settings) == {
        "extra_body": {"think": False},
        "timeout": 21,
    }


def test_runtime_instructions_include_configured_system_prompt() -> None:
    runtime_settings = SimpleNamespace(
        response_route=DummyRoute("openai", "gpt-5.4"),
        system_prompt="请优先输出结论。",
    )

    instructions = build_runtime_instructions(
        SimpleNamespace(
            deps=build_deps(runtime_settings=runtime_settings),
        )
    )

    assert instructions == "请优先输出结论。\n当前 response provider=openai, model=gpt-5.4."
