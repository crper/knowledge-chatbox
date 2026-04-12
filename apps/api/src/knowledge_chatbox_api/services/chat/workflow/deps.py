from dataclasses import dataclass, field
from typing import Any

from sqlalchemy.orm import Session

from knowledge_chatbox_api.repositories.chat_repository import ChatRepository
from knowledge_chatbox_api.repositories.chat_run_event_repository import ChatRunEventRepository
from knowledge_chatbox_api.repositories.chat_run_repository import ChatRunRepository
from knowledge_chatbox_api.schemas.settings import ProviderRuntimeSettings
from knowledge_chatbox_api.services.chat.prompt_attachment_service import PromptAttachmentService
from knowledge_chatbox_api.services.chat.retrieval_service import RetrievalService
from knowledge_chatbox_api.services.chat.workflow.output import WorkflowSource


@dataclass(frozen=True, slots=True)
class ChatWorkflowDeps:
    session_id: int
    session: Session
    chat_repository: ChatRepository
    chat_run_repository: ChatRunRepository
    chat_run_event_repository: ChatRunEventRepository
    retrieval_service: RetrievalService
    prompt_attachment_service: PromptAttachmentService
    runtime_settings: ProviderRuntimeSettings
    request_metadata: dict[str, Any]
    retrieved_sources: list[WorkflowSource] = field(default_factory=list)
