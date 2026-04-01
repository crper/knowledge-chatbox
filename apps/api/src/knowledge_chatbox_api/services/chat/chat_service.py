"""聊天 prompt 组装与回答 orchestration。"""

from __future__ import annotations

from typing import Any

from knowledge_chatbox_api.core.logging import get_logger
from knowledge_chatbox_api.providers.factory import build_embedding_adapter_from_settings
from knowledge_chatbox_api.repositories.chat_repository import ChatRepository
from knowledge_chatbox_api.services.chat.prompt_attachment_service import (
    PromptAttachmentService,
)
from knowledge_chatbox_api.services.chat.retrieval_service import RetrievalService
from knowledge_chatbox_api.utils.embedding_cache import CachedEmbeddingProvider
from knowledge_chatbox_api.utils.settings_helpers import get_response_route_info

PROMPT_HISTORY_MESSAGE_LIMIT = 4
logger = get_logger(__name__)


class ChatService:
    """封装聊天问答主流程。"""

    def __init__(
        self,
        *,
        session,
        chat_repository: ChatRepository,
        chroma_store,
        response_adapter,
        embedding_adapter,
        settings,
    ) -> None:
        self.chat_repository = chat_repository
        self.response_adapter = response_adapter
        self.settings = settings
        raw_adapter = embedding_adapter or self._get_embedding_adapter()
        self.embedding_adapter = CachedEmbeddingProvider(raw_adapter)
        self.prompt_attachment_service = PromptAttachmentService(session)
        self.retrieval_service = RetrievalService(
            session=session,
            chroma_store=chroma_store,
            embedding_adapter=self.embedding_adapter,
            settings=settings,
        )

    def answer_question(
        self,
        session_id: int,
        question: str,
        attachments: list[dict[str, Any]] | None = None,
    ) -> dict:
        prompt_messages, sources = self.build_prompt_messages_and_sources(
            session_id,
            question,
            attachments=attachments,
        )
        answer = self.response_adapter.response(prompt_messages, self.settings)
        logger.info(
            "chat_response_completed",
            session_id=session_id,
            attachment_count=len(attachments or []),
            source_count=len(sources),
            answer_length=len(answer) if isinstance(answer, str) else 0,
            response_provider=self._response_provider_name(),
            response_model=self._response_model(),
        )
        return {"answer": answer, "sources": sources}

    def build_prompt_messages_and_sources(
        self,
        session_id: int,
        question: str,
        *,
        attachments: list[dict[str, Any]] | None = None,
    ) -> tuple[list[dict[str, Any]], list[dict]]:
        history = self.chat_repository.list_recent_messages(
            session_id,
            limit=PROMPT_HISTORY_MESSAGE_LIMIT,
        )
        chat_session = self.chat_repository.get_session(session_id)
        active_space_id = chat_session.space_id if chat_session is not None else None
        prompt_attachments = self.prompt_attachment_service.build_prompt_attachments(
            attachments,
            active_space_id,
        )
        prompt_text = self.prompt_attachment_service.resolve_prompt_text(question, attachments)
        retrieved_context = self.retrieval_service.retrieve_context(
            question,
            active_space_id=active_space_id,
            attachments=attachments,
        )

        prompt_messages: list[dict[str, Any]] = []
        system_prompt = self._system_prompt_content()
        if system_prompt is not None:
            prompt_messages.append({"role": "system", "content": system_prompt})
        if retrieved_context.context_sections:
            prompt_messages.append(
                {
                    "role": "system",
                    "content": "Use the following knowledge base context when answering.\n\n"
                    + "\n\n".join(retrieved_context.context_sections),
                }
            )
        prompt_messages.extend(
            {"role": message.role, "content": message.content} for message in history
        )
        if not history or history[-1].role != "user" or history[-1].content != question:
            if prompt_attachments:
                user_content: list[dict[str, Any]] = [{"type": "text", "text": prompt_text}]
                user_content.extend(prompt_attachments)
                prompt_messages.append({"role": "user", "content": user_content})
            else:
                prompt_messages.append({"role": "user", "content": question})

        logger.info(
            "chat_prompt_assembled",
            session_id=session_id,
            attachment_count=len(attachments or []),
            retrieved_source_count=len(retrieved_context.sources),
            response_provider=self._response_provider_name(),
            response_model=self._response_model(),
        )
        return prompt_messages, retrieved_context.sources

    def _system_prompt_content(self) -> str | None:
        content = getattr(self.settings, "system_prompt", None)
        if not isinstance(content, str):
            return None
        normalized = content.strip()
        return normalized or None

    def _get_embedding_adapter(self):
        return build_embedding_adapter_from_settings(self.settings)

    def _response_provider_name(self) -> str:
        provider, _, _ = get_response_route_info(self.settings)
        return provider

    def _response_model(self) -> str:
        _, model, _ = get_response_route_info(self.settings)
        return model
