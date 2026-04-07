from __future__ import annotations

import asyncio
from types import SimpleNamespace

from pydantic_ai import AgentRunResultEvent
from pydantic_ai.messages import BinaryContent, ModelRequest, ModelResponse, TextPart
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
    def __init__(
        self,
        recent_messages: list[DummyMessage] | None = None,
        *,
        space_id: int | None = None,
    ) -> None:
        self._recent_messages = list(recent_messages or [])
        self._space_id = space_id

    def list_recent_messages(self, session_id: int, *, limit: int):
        assert session_id == 1
        assert limit == 4
        return list(self._recent_messages)

    def get_session(self, session_id: int):
        assert session_id == 1
        return SimpleNamespace(space_id=self._space_id)


class DummyPromptAttachmentService:
    def build_prompt_attachments(self, attachments, active_space_id: int | None):
        del attachments, active_space_id
        return []

    def resolve_prompt_text(self, question: str, attachments):
        del attachments
        return question


def build_deps(
    *,
    runtime_settings: DummyRuntimeSettings | None = None,
    recent_messages: list[DummyMessage] | None = None,
    prompt_attachment_service: DummyPromptAttachmentService | None = None,
    space_id: int | None = None,
) -> ChatWorkflowDeps:
    return ChatWorkflowDeps(
        session=object(),
        actor=object(),
        chat_repository=DummyChatRepository(recent_messages, space_id=space_id),
        chat_run_repository=object(),
        chat_run_event_repository=object(),
        retrieval_service=object(),
        prompt_attachment_service=prompt_attachment_service or DummyPromptAttachmentService(),
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
        "继续刚才的话题\n\n"
        "session_id=1\n"
        "question=继续刚才的话题\n"
        "attachments=[]\n"
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


def test_chat_workflow_passes_multimodal_user_prompt_when_image_attachments_exist(
    monkeypatch,
) -> None:
    captured: dict[str, object] = {}

    class ImagePromptAttachmentService(DummyPromptAttachmentService):
        def build_prompt_attachments(self, attachments, active_space_id: int | None):
            assert attachments == [{"type": "image", "document_revision_id": 9}]
            assert active_space_id == 77
            return [
                {
                    "type": "image",
                    "mime_type": "image/jpeg",
                    "data_base64": "aGVsbG8=",
                }
            ]

        def resolve_prompt_text(self, question: str, attachments):
            assert question == ""
            assert attachments == [{"type": "image", "document_revision_id": 9}]
            return "Analyze the attached image."

    class CapturingAgent:
        def run_sync(self, user_prompt, **kwargs):
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
        attachments=[{"type": "image", "document_revision_id": 9}],
    )

    assert result.answer == "已捕获"
    user_prompt = captured["user_prompt"]
    assert isinstance(user_prompt, list)
    assert user_prompt[0].startswith("Analyze the attached image.")
    assert isinstance(user_prompt[1], BinaryContent)
    assert user_prompt[1].data == b"hello"
    assert user_prompt[1].media_type == "image/jpeg"


def test_chat_workflow_stream_passes_multimodal_user_prompt_when_image_attachments_exist(
    monkeypatch,
) -> None:
    captured: dict[str, object] = {}

    class ImagePromptAttachmentService(DummyPromptAttachmentService):
        def build_prompt_attachments(self, attachments, active_space_id: int | None):
            assert attachments == [{"type": "image", "document_revision_id": 12}]
            assert active_space_id == 88
            return [
                {
                    "type": "image",
                    "mime_type": "image/jpeg",
                    "data_base64": "aGVsbG8=",
                }
            ]

        def resolve_prompt_text(self, question: str, attachments):
            assert question == "这张图是什么"
            assert attachments == [{"type": "image", "document_revision_id": 12}]
            return "这张图是什么"

    class CapturingStreamAgent:
        def run_stream_events(self, user_prompt, **kwargs):
            del kwargs
            captured["user_prompt"] = user_prompt

            async def _events():
                if False:
                    yield None

            return _events()

    workflow = ChatWorkflow()
    monkeypatch.setattr(
        workflow,
        "_build_stream_agent",
        lambda _runtime_settings: CapturingStreamAgent(),
    )

    async def collect_events():
        events = []
        async for event in workflow.run_stream_events(
            deps=build_deps(
                prompt_attachment_service=ImagePromptAttachmentService(),
                space_id=88,
            ),
            session_id=1,
            question="这张图是什么",
            attachments=[{"type": "image", "document_revision_id": 12}],
        ):
            events.append(event)
        return events

    events = asyncio.run(collect_events())

    assert events == []
    user_prompt = captured["user_prompt"]
    assert isinstance(user_prompt, list)
    assert user_prompt[0].startswith("这张图是什么")
    assert isinstance(user_prompt[1], BinaryContent)
    assert user_prompt[1].data == b"hello"
    assert user_prompt[1].media_type == "image/jpeg"


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
