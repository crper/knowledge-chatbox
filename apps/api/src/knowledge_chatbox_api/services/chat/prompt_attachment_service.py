"""Prompt attachment preparation helpers for chat requests."""

from __future__ import annotations

import base64
from io import BytesIO
from pathlib import Path
from typing import Any

from PIL import Image, ImageOps, UnidentifiedImageError

from knowledge_chatbox_api.models.document import DocumentRevision
from knowledge_chatbox_api.repositories.document_repository import DocumentRepository

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

    def __init__(self, session) -> None:
        self.document_repository = DocumentRepository(session)

    def has_only_image_attachments(self, attachments: list[dict[str, Any]] | None) -> bool:
        if not attachments:
            return False
        return all(attachment.get("type") == "image" for attachment in attachments)

    def resolve_prompt_text(
        self,
        question: str,
        attachments: list[dict[str, Any]] | None,
    ) -> str:
        prompt_text = question.strip()
        if prompt_text:
            return prompt_text
        if self.has_only_image_attachments(attachments):
            return IMAGE_ANALYZE_FALLBACK_PROMPT
        if attachments:
            return DOCUMENT_ANALYZE_FALLBACK_PROMPT
        return ""

    def build_prompt_attachments(
        self,
        attachments: list[dict[str, Any]] | None,
        active_space_id: int | None,
    ) -> list[dict[str, Any]]:
        if not attachments:
            return []

        prompt_attachments: list[dict[str, Any]] = []
        for attachment in attachments:
            if attachment.get("type") != "image":
                prompt_attachments.append(
                    self._build_prompt_document_attachment(attachment, active_space_id)
                )
                continue
            prompt_attachments.append(
                self._build_prompt_image_attachment(attachment, active_space_id)
            )
        return prompt_attachments

    def _build_prompt_document_attachment(
        self,
        attachment: dict[str, Any],
        active_space_id: int | None,
    ) -> dict[str, Any]:
        document_version, attachment_name = self._resolve_document_context(
            attachment,
            active_space_id,
            error_message=DOCUMENT_ATTACHMENT_PROCESSING_ERROR_MESSAGE,
        )
        try:
            document_text = self._read_attached_document_text(document_version)
        except ValueError:
            document_text = self._build_attached_document_fallback_text(attachment_name)
        return {
            "type": "text",
            "text": f"Attached document: {attachment_name}\n\n{document_text}",
        }

    def _build_prompt_image_attachment(
        self,
        attachment: dict[str, Any],
        active_space_id: int | None,
    ) -> dict[str, Any]:
        document_version, _ = self._resolve_document_context(
            attachment,
            active_space_id,
            error_message=IMAGE_ATTACHMENT_PROCESSING_ERROR_MESSAGE,
        )
        try:
            data_base64 = self._encode_image_attachment(Path(document_version.source_path))
        except (OSError, UnidentifiedImageError, ValueError) as exc:
            raise ValueError(IMAGE_ATTACHMENT_PROCESSING_ERROR_MESSAGE) from exc

        return {
            **attachment,
            "mime_type": "image/jpeg",
            "data_base64": data_base64,
        }

    def _resolve_document_context(
        self,
        attachment: dict[str, Any],
        active_space_id: int | None,
        *,
        error_message: str,
    ) -> tuple[DocumentRevision, str]:
        revision_id = attachment.get("document_revision_id")
        if not isinstance(revision_id, int):
            raise ValueError(error_message)

        document_version = self.document_repository.get_by_id(revision_id)
        if document_version is None:
            raise ValueError(error_message)

        document = self.document_repository.get_document_entity(document_version.document_id)
        if document is None or (
            active_space_id is not None and document.space_id != active_space_id
        ):
            raise ValueError(error_message)

        attachment_name = attachment.get("name") or document.logical_name
        if not isinstance(attachment_name, str) or not attachment_name:
            attachment_name = document.logical_name
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
        chunks: list[str] = []

        with path.open(encoding="utf-8") as stream:
            while True:
                chunk = stream.read(1024)
                if not chunk:
                    return "".join(chunks).strip()

                chunks.append(chunk)
                preview = "".join(chunks).strip()
                if len(preview) > ATTACHED_DOCUMENT_PROMPT_CHAR_LIMIT:
                    return self._truncate_attached_document_text(preview)

    def _truncate_attached_document_text(self, content: str) -> str:
        if len(content) <= ATTACHED_DOCUMENT_PROMPT_CHAR_LIMIT:
            return content
        truncated = content[:ATTACHED_DOCUMENT_PROMPT_CHAR_LIMIT].rstrip()
        return f"{truncated}\n\n[Truncated]"

    def _build_attached_document_fallback_text(self, attachment_name: str) -> str:
        return (
            f"Document content preview is currently unavailable for {attachment_name}. "
            "Use any retrieved context and attachment metadata when answering."
        )

    def _encode_image_attachment(self, source_path: Path) -> str:
        with Image.open(source_path) as source_image:
            prepared_image = ImageOps.exif_transpose(source_image).convert("RGB")
            try:
                prepared_image.thumbnail((2048, 2048))
                buffer = BytesIO()
                prepared_image.save(buffer, format="JPEG", quality=85)
            finally:
                prepared_image.close()

        return base64.b64encode(buffer.getvalue()).decode("utf-8")
