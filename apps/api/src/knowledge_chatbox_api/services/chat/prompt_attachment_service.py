"""Prompt attachment preparation helpers for chat requests."""

from __future__ import annotations

import base64
from pathlib import Path
from typing import TYPE_CHECKING

from PIL import UnidentifiedImageError

from knowledge_chatbox_api.models.enums import ChatAttachmentType
from knowledge_chatbox_api.repositories.document_repository import DocumentRepository
from knowledge_chatbox_api.schemas.chat import ChatAttachmentMetadata, PromptAttachmentItem
from knowledge_chatbox_api.services.chat.retrieval.policy import has_only_image_attachments
from knowledge_chatbox_api.utils.image import prepare_image_bytes

if TYPE_CHECKING:
    from sqlalchemy.orm import Session

    from knowledge_chatbox_api.models.document import Document, DocumentRevision

IMAGE_ANALYZE_FALLBACK_PROMPT = "Analyze the attached image."
DOCUMENT_ANALYZE_FALLBACK_PROMPT = "Summarize the attached documents."
IMAGE_ATTACHMENT_PROCESSING_ERROR_MESSAGE = (
    "Attached image could not be processed. Make sure the image opens normally and retry with a "
    "vision-capable model."
)
DOCUMENT_ATTACHMENT_PROCESSING_ERROR_MESSAGE = (
    "Attached document could not be processed. Make sure it was indexed successfully and retry."
)
ATTACHED_DOCUMENT_PROMPT_CHAR_LIMIT = 6000


class PromptAttachmentService:
    """Prepare attachment payloads that are safe to send to response providers."""

    def __init__(
        self,
        session: Session | None = None,
        *,
        document_repository: DocumentRepository | None = None,
    ) -> None:
        if document_repository is not None:
            self.document_repository = document_repository
        elif session is not None:
            self.document_repository = DocumentRepository(session)
        else:
            raise TypeError("Either session or document_repository must be provided")

    def resolve_prompt_text(
        self,
        question: str,
        attachments: list[ChatAttachmentMetadata] | None,
    ) -> str:
        prompt_text = question.strip()
        if prompt_text:
            return prompt_text
        if has_only_image_attachments(attachments):
            return IMAGE_ANALYZE_FALLBACK_PROMPT
        if attachments:
            return DOCUMENT_ANALYZE_FALLBACK_PROMPT
        return ""

    def build_prompt_attachments(
        self,
        attachments: list[ChatAttachmentMetadata] | None,
        active_space_id: int | None,
    ) -> list[PromptAttachmentItem]:
        if not attachments:
            return []

        revision_cache, document_cache = self._build_document_context_cache(attachments)
        prompt_attachments: list[PromptAttachmentItem] = []
        for attachment in attachments:
            if attachment.type != ChatAttachmentType.IMAGE:
                prompt_attachments.append(
                    self._build_prompt_document_attachment(
                        attachment,
                        active_space_id,
                        revision_cache=revision_cache,
                        document_cache=document_cache,
                    )
                )
                continue
            prompt_attachments.append(
                self._build_prompt_image_attachment(
                    attachment,
                    active_space_id,
                    revision_cache=revision_cache,
                    document_cache=document_cache,
                )
            )
        return prompt_attachments

    def _build_document_context_cache(
        self, attachments: list[ChatAttachmentMetadata]
    ) -> tuple[dict[int, DocumentRevision], dict[int, Document]]:
        revision_ids: list[int] = sorted(
            {
                attachment.document_revision_id
                for attachment in attachments
                if attachment.document_revision_id is not None
            }
        )
        if not revision_ids:
            return {}, {}

        revision_cache: dict[int, DocumentRevision] = (
            self.document_repository.list_revisions_by_ids(revision_ids)
        )
        document_ids: list[int] = sorted(
            {revision.document_id for revision in revision_cache.values()}
        )
        document_cache: dict[int, Document] = self.document_repository.get_by_ids(document_ids)
        return revision_cache, document_cache

    def _build_prompt_document_attachment(
        self,
        attachment: ChatAttachmentMetadata,
        active_space_id: int | None,
        *,
        revision_cache: dict[int, DocumentRevision] | None = None,
        document_cache: dict[int, Document] | None = None,
    ) -> PromptAttachmentItem:
        document_version, attachment_name = self._resolve_document_context(
            attachment,
            active_space_id,
            error_message=DOCUMENT_ATTACHMENT_PROCESSING_ERROR_MESSAGE,
            revision_cache=revision_cache,
            document_cache=document_cache,
        )
        try:
            document_text = self._read_attached_document_text(document_version)
        except ValueError:
            document_text = self._build_attached_document_fallback_text(attachment_name)
        return PromptAttachmentItem(
            type="text",
            text=f"Attached document: {attachment_name}\n\n{document_text}",
        )

    def _build_prompt_image_attachment(
        self,
        attachment: ChatAttachmentMetadata,
        active_space_id: int | None,
        *,
        revision_cache: dict[int, DocumentRevision] | None = None,
        document_cache: dict[int, Document] | None = None,
    ) -> PromptAttachmentItem:
        document_version, _ = self._resolve_document_context(
            attachment,
            active_space_id,
            error_message=IMAGE_ATTACHMENT_PROCESSING_ERROR_MESSAGE,
            revision_cache=revision_cache,
            document_cache=document_cache,
        )
        try:
            data_base64 = self._encode_image_attachment(Path(document_version.source_path))
        except (OSError, UnidentifiedImageError, ValueError) as exc:
            raise ValueError(IMAGE_ATTACHMENT_PROCESSING_ERROR_MESSAGE) from exc

        return PromptAttachmentItem(
            type=ChatAttachmentType.IMAGE,
            name=attachment.name,
            attachment_id=attachment.attachment_id,
            document_id=attachment.document_id,
            document_revision_id=attachment.document_revision_id,
            mime_type="image/jpeg",
            data_base64=data_base64,
        )

    def _resolve_document_context(
        self,
        attachment: ChatAttachmentMetadata,
        active_space_id: int | None,
        *,
        error_message: str,
        revision_cache: dict[int, DocumentRevision] | None = None,
        document_cache: dict[int, Document] | None = None,
    ) -> tuple[DocumentRevision, str]:
        revision_id = attachment.document_revision_id
        if revision_id is None:
            raise ValueError(error_message)

        document_version: DocumentRevision | None = (
            revision_cache.get(revision_id)
            if revision_cache is not None
            else self.document_repository.get_by_id(revision_id)
        )
        if document_version is None:
            raise ValueError(error_message)

        document: Document | None = (
            document_cache.get(document_version.document_id)
            if document_cache is not None
            else self.document_repository.get_one_or_none(id=document_version.document_id)
        )
        if document is None or (
            active_space_id is not None and document.space_id != active_space_id
        ):
            raise ValueError(error_message)

        attachment_name = attachment.name or document.logical_name
        return document_version, attachment_name

    def _read_attached_document_text(self, document_version: DocumentRevision) -> str:
        candidate_paths = [document_version.normalized_path]
        if document_version.file_type in {"txt", "md", "markdown"}:
            candidate_paths.append(document_version.source_path)

        for candidate_path in candidate_paths:
            if not isinstance(candidate_path, str) or not candidate_path:
                continue
            try:
                content = self._read_attached_document_preview(Path(candidate_path))
            except (OSError, UnicodeDecodeError):
                continue
            if content:
                return content

        raise ValueError(DOCUMENT_ATTACHMENT_PROCESSING_ERROR_MESSAGE)

    def _read_attached_document_preview(self, path: Path) -> str:
        content = path.read_text(encoding="utf-8").strip()
        if len(content) > ATTACHED_DOCUMENT_PROMPT_CHAR_LIMIT:
            return self._truncate_attached_document_text(content)
        return content

    def _truncate_attached_document_text(self, content: str) -> str:
        truncated = content[:ATTACHED_DOCUMENT_PROMPT_CHAR_LIMIT].rstrip()
        return f"{truncated}\n\n[Truncated]"

    def _build_attached_document_fallback_text(self, attachment_name: str) -> str:
        return (
            f"Document content preview is currently unavailable for {attachment_name}. "
            "Use any retrieved context and attachment metadata when answering."
        )

    def _encode_image_attachment(self, source_path: Path) -> str:
        _, _, image_bytes = prepare_image_bytes(source_path, max_dimension=2048)
        return base64.b64encode(image_bytes).decode("utf-8")
