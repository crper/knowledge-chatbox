from __future__ import annotations

from knowledge_chatbox_api.services.chat.prompt_attachment_service import PromptAttachmentService
from knowledge_chatbox_api.services.chat.retrieval_service import RetrievalService
from knowledge_chatbox_api.services.chat.workflow.deps import ChatWorkflowDeps


def build_chat_workflow_deps(
    *,
    session,
    actor,
    chat_repository,
    chat_run_repository,
    chat_run_event_repository,
    chroma_store,
    embedding_adapter,
    runtime_settings,
    request_metadata: dict[str, object],
) -> ChatWorkflowDeps:
    return ChatWorkflowDeps(
        session=session,
        actor=actor,
        chat_repository=chat_repository,
        chat_run_repository=chat_run_repository,
        chat_run_event_repository=chat_run_event_repository,
        retrieval_service=RetrievalService(
            session=session,
            chroma_store=chroma_store,
            embedding_adapter=embedding_adapter,
            settings=runtime_settings,
        ),
        prompt_attachment_service=PromptAttachmentService(session),
        runtime_settings=runtime_settings,
        request_metadata=request_metadata,
    )
