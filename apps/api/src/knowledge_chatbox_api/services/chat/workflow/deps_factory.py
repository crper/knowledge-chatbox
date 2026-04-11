from sqlalchemy.orm import Session

from knowledge_chatbox_api.providers.base import BaseEmbeddingAdapter
from knowledge_chatbox_api.repositories.chat_repository import ChatRepository
from knowledge_chatbox_api.repositories.chat_run_event_repository import (
    ChatRunEventRepository,
)
from knowledge_chatbox_api.repositories.chat_run_repository import ChatRunRepository
from knowledge_chatbox_api.schemas.settings import ProviderRuntimeSettings
from knowledge_chatbox_api.services.chat.prompt_attachment_service import PromptAttachmentService
from knowledge_chatbox_api.services.chat.retrieval_service import RetrievalService
from knowledge_chatbox_api.services.chat.workflow.deps import ChatWorkflowDeps
from knowledge_chatbox_api.utils.chroma import ChunkStore


def build_chat_workflow_deps(
    *,
    session_id: int,
    session: Session,
    chat_repository: ChatRepository,
    chat_run_repository: ChatRunRepository,
    chat_run_event_repository: ChatRunEventRepository,
    chroma_store: ChunkStore,
    embedding_adapter: BaseEmbeddingAdapter,
    runtime_settings: ProviderRuntimeSettings,
    request_metadata: dict[str, object],
) -> ChatWorkflowDeps:
    return ChatWorkflowDeps(
        session_id=session_id,
        session=session,
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
