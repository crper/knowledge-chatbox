from __future__ import annotations

from typing import Any

from pydantic_ai import RunContext
from pydantic_ai.models.test import TestModel
from pydantic_ai.usage import RunUsage
from tests.fixtures.dummies import DummyRuntimeSettings

from knowledge_chatbox_api.models.enums import ChatAttachmentType
from knowledge_chatbox_api.schemas.chat import ChatAttachmentMetadata, PromptAttachmentItem
from knowledge_chatbox_api.services.chat.workflow.deps import ChatWorkflowDeps
from knowledge_chatbox_api.services.chat.workflow.output import WorkflowSource
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
            WorkflowSource(
                document_id=1,
                document_revision_id=2,
                document_name="test.md",
                chunk_id="chunk-1",
                snippet="hello",
                score=0.9,
            )
        ]


class FakeRetrievalService:
    def retrieve_context(self, query: str, *, active_space_id: int | None, attachments: Any = None):
        assert query == "帮我总结"
        assert active_space_id == 42
        assert len(attachments) == 1
        assert attachments[0].type == ChatAttachmentType.DOCUMENT
        assert attachments[0].document_revision_id == 2
        return FakeRetrievedContext()


class FakePromptAttachmentService:
    def build_prompt_attachments(self, attachments, active_space_id: int | None):
        del attachments
        assert active_space_id == 42
        return [PromptAttachmentItem(type="text", text="Attached document: test")]

    def resolve_prompt_text(self, question: str, attachments):
        assert question == ""
        assert len(attachments) == 1
        assert attachments[0].type == ChatAttachmentType.DOCUMENT
        assert attachments[0].document_revision_id == 2
        return "Summarize the attached documents."


def build_test_context() -> RunContext[ChatWorkflowDeps]:
    deps = ChatWorkflowDeps(
        session_id=1,
        chat_repository=FakeChatRepository(space_id=42),
        retrieval_service=FakeRetrievalService(),
        prompt_attachment_service=FakePromptAttachmentService(),
        runtime_settings=DummyRuntimeSettings(),
        request_metadata={"path": "unit"},
    )
    return RunContext(
        deps=deps,
        model=TestModel(call_tools=[]),
        usage=RunUsage(),
        prompt="test",
    )


async def test_knowledge_search_tool_returns_typed_output() -> None:
    result = await knowledge_search_tool(
        build_test_context(),
        query="帮我总结",
        attachments=[
            ChatAttachmentMetadata(
                attachment_id="test-1",
                type=ChatAttachmentType.DOCUMENT,
                name="test.pdf",
                mime_type="application/pdf",
                size_bytes=100,
                document_revision_id=2,
            )
        ],
    )

    assert result.context_sections == ["Document: test\nContent: hello"]
    assert len(result.sources) == 1
    assert result.sources[0].document_revision_id == 2


async def test_load_prompt_attachments_tool_returns_prompt_text_and_attachments() -> None:
    result = await load_prompt_attachments_tool(
        build_test_context(),
        question="",
        attachments=[
            ChatAttachmentMetadata(
                attachment_id="test-1",
                type=ChatAttachmentType.DOCUMENT,
                name="test.pdf",
                mime_type="application/pdf",
                size_bytes=100,
                document_revision_id=2,
            )
        ],
    )

    assert result.prompt_text == "Summarize the attached documents."
    assert len(result.attachments) == 1
    assert result.attachments[0].type == "text"
    assert result.attachments[0].text == "Attached document: test"
