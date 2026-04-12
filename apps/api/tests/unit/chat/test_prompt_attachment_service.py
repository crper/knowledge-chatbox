from __future__ import annotations

from types import SimpleNamespace
from typing import Any

from knowledge_chatbox_api.models.enums import ChatAttachmentType
from knowledge_chatbox_api.services.chat.prompt_attachment_service import PromptAttachmentService


class FakeDocumentRepository:
    def __init__(self, revisions_by_id: dict[int, Any], documents_by_id: dict[int, Any]) -> None:
        self._revisions_by_id = revisions_by_id
        self._documents_by_id = documents_by_id
        self.list_revisions_by_ids_calls: list[list[int]] = []
        self.list_documents_by_ids_calls: list[list[int]] = []
        self.get_by_id_calls = 0
        self.get_document_entity_calls = 0

    def list_revisions_by_ids(self, revision_ids: list[int]) -> dict[int, Any]:
        self.list_revisions_by_ids_calls.append(list(revision_ids))
        return {revision_id: self._revisions_by_id[revision_id] for revision_id in revision_ids}

    def list_documents_by_ids(self, document_ids: list[int]) -> dict[int, Any]:
        self.list_documents_by_ids_calls.append(list(document_ids))
        return {document_id: self._documents_by_id[document_id] for document_id in document_ids}

    def get_by_id(self, revision_id: int) -> Any:
        self.get_by_id_calls += 1
        raise AssertionError(f"expected batch lookup, got get_by_id({revision_id})")

    def get_document_entity(self, document_id: int) -> Any:
        self.get_document_entity_calls += 1
        raise AssertionError(f"expected batch lookup, got get_document_entity({document_id})")


def test_build_prompt_attachments_batches_document_context_queries(tmp_path) -> None:
    preview_a = tmp_path / "revision-a.txt"
    preview_a.write_text("文档 A", encoding="utf-8")
    preview_b = tmp_path / "revision-b.txt"
    preview_b.write_text("文档 B", encoding="utf-8")

    revisions_by_id = {
        11: SimpleNamespace(
            id=11,
            document_id=101,
            normalized_path=str(preview_a),
            source_path=str(preview_a),
            file_type="txt",
        ),
        12: SimpleNamespace(
            id=12,
            document_id=102,
            normalized_path=str(preview_b),
            source_path=str(preview_b),
            file_type="txt",
        ),
    }
    documents_by_id = {
        101: SimpleNamespace(id=101, space_id=9, logical_name="a.txt"),
        102: SimpleNamespace(id=102, space_id=9, logical_name="b.txt"),
    }

    repository = FakeDocumentRepository(revisions_by_id, documents_by_id)
    service = PromptAttachmentService(document_repository=repository)

    result = service.build_prompt_attachments(
        [
            {
                "type": ChatAttachmentType.DOCUMENT,
                "document_revision_id": 11,
                "name": "A 文档",
            },
            {
                "type": ChatAttachmentType.DOCUMENT,
                "document_revision_id": 12,
                "name": "B 文档",
            },
        ],
        active_space_id=9,
    )

    assert len(result) == 2
    assert all(item["type"] == "text" for item in result)
    assert "Attached document: A 文档" in result[0]["text"]
    assert "Attached document: B 文档" in result[1]["text"]
    assert repository.list_revisions_by_ids_calls == [[11, 12]]
    assert repository.list_documents_by_ids_calls == [[101, 102]]
    assert repository.get_by_id_calls == 0
    assert repository.get_document_entity_calls == 0
