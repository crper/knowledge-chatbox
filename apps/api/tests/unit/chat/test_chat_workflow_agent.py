from __future__ import annotations

import asyncio

from pydantic_ai import RunContext
from pydantic_ai.models.test import TestModel
from pydantic_ai.usage import RunUsage

from knowledge_chatbox_api.services.chat.workflow.agent import build_chat_agent
from knowledge_chatbox_api.services.chat.workflow.deps import ChatWorkflowDeps
from knowledge_chatbox_api.services.chat.workflow.tools import (
    knowledge_search_tool,
    load_prompt_attachments_tool,
)


class FakeSession:
    def __init__(self, space_id: int) -> None:
        self.space_id = space_id


class FakeChatRepository:
    def __init__(self, space_id: int) -> None:
        self._session = FakeSession(space_id)

    def get_session(self, session_id: int) -> FakeSession:
        assert session_id == 1
        return self._session


class FakeRetrievedContext:
    def __init__(self) -> None:
        self.context_sections = ["Document: test\nContent: hello"]
        self.sources = [
            {
                "document_id": 1,
                "document_revision_id": 2,
                "document_name": "test.md",
                "chunk_id": "chunk-1",
                "snippet": "hello",
                "page_number": None,
                "section_title": None,
                "score": 0.9,
            }
        ]


class FakeRetrievalService:
    def retrieve_context(self, query: str, *, active_space_id: int | None, attachments=None):
        assert query == "帮我总结"
        assert active_space_id == 42
        assert attachments == [{"type": "document", "document_revision_id": 2}]
        return FakeRetrievedContext()


class FakePromptAttachmentService:
    def build_prompt_attachments(self, attachments, active_space_id: int | None):
        assert active_space_id == 42
        return [{"type": "text", "text": "Attached document: test"}]

    def resolve_prompt_text(self, question: str, attachments):
        assert question == ""
        assert attachments == [{"type": "document", "document_revision_id": 2}]
        return "Summarize the attached documents."


def build_test_context() -> RunContext[ChatWorkflowDeps]:
    deps = ChatWorkflowDeps(
        session=object(),
        actor=object(),
        chat_repository=FakeChatRepository(space_id=42),
        chat_run_repository=object(),
        chat_run_event_repository=object(),
        retrieval_service=FakeRetrievalService(),
        prompt_attachment_service=FakePromptAttachmentService(),
        runtime_settings=object(),
        request_metadata={"path": "unit"},
    )
    return RunContext(
        deps=deps,
        model=TestModel(call_tools=[]),
        usage=RunUsage(),
        prompt="test",
    )


def test_build_chat_agent_returns_agent_instance() -> None:
    agent = build_chat_agent(model=TestModel(call_tools=[]))
    assert agent is not None


def test_knowledge_search_tool_returns_typed_output() -> None:
    result = asyncio.run(
        knowledge_search_tool(
            build_test_context(),
            query="帮我总结",
            session_id=1,
            attachments=[{"type": "document", "document_revision_id": 2}],
        )
    )

    assert result.context_sections == ["Document: test\nContent: hello"]
    assert len(result.sources) == 1
    assert result.sources[0].document_revision_id == 2


def test_load_prompt_attachments_tool_returns_prompt_text_and_attachments() -> None:
    result = asyncio.run(
        load_prompt_attachments_tool(
            build_test_context(),
            question="",
            session_id=1,
            attachments=[{"type": "document", "document_revision_id": 2}],
        )
    )

    assert result.prompt_text == "Summarize the attached documents."
    assert result.attachments == [{"type": "text", "text": "Attached document: test"}]
