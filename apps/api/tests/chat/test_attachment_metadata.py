from __future__ import annotations

import pytest
from pydantic import ValidationError as PydanticValidationError

from knowledge_chatbox_api.schemas.chat import (
    ChatAttachmentInput,
    ChatAttachmentMetadata,
    parse_chat_attachment_inputs,
    serialize_chat_attachments,
)


def test_serialize_chat_attachments_returns_unified_metadata_shape() -> None:
    attachments = [
        ChatAttachmentInput(
            attachment_id="att-1",
            type="image",
            name="image.png",
            mime_type="image/png",
            size_bytes=5,
            resource_document_id=10,
            resource_document_version_id=11,
        )
    ]

    result = serialize_chat_attachments(attachments)

    assert result == [
        ChatAttachmentMetadata(
            attachment_id="att-1",
            type="image",
            name="image.png",
            mime_type="image/png",
            size_bytes=5,
            document_id=10,
            document_revision_id=11,
            archived_at=None,
        )
    ]


def test_serialize_chat_attachments_accepts_mapping_inputs_for_streaming_path() -> None:
    result = serialize_chat_attachments(
        [
            {
                "attachment_id": "att-2",
                "type": "image",
                "name": "preview.jpg",
                "mime_type": "image/jpeg",
                "size_bytes": 9,
                "resource_document_id": 20,
                "resource_document_version_id": 21,
            }
        ]
    )

    assert result == [
        ChatAttachmentMetadata(
            attachment_id="att-2",
            type="image",
            name="preview.jpg",
            mime_type="image/jpeg",
            size_bytes=9,
            document_id=20,
            document_revision_id=21,
            archived_at=None,
        )
    ]


def test_parse_chat_attachment_inputs_accepts_mapping_inputs() -> None:
    result = parse_chat_attachment_inputs(
        [
            {
                "attachment_id": "att-3",
                "type": "document",
                "name": "notes.md",
                "mime_type": "text/markdown",
                "size_bytes": 12,
                "resource_document_id": 30,
                "resource_document_version_id": 31,
            }
        ]
    )

    assert result == [
        ChatAttachmentInput(
            attachment_id="att-3",
            type="document",
            name="notes.md",
            mime_type="text/markdown",
            size_bytes=12,
            document_id=30,
            document_revision_id=31,
        )
    ]


def test_parse_chat_attachment_inputs_rejects_invalid_mappings() -> None:
    with pytest.raises(PydanticValidationError):
        parse_chat_attachment_inputs(
            [
                {
                    "attachment_id": "att-4",
                    "type": "audio",
                    "name": "invalid.bin",
                    "mime_type": "application/octet-stream",
                    "size_bytes": 1,
                    "resource_document_id": 40,
                    "resource_document_version_id": 41,
                }
            ]
        )
