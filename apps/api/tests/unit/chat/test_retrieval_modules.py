from __future__ import annotations

from knowledge_chatbox_api.services.chat.retrieval.policy import (
    build_retrieval_where_filter,
    should_retrieve_knowledge,
)


def test_should_retrieve_knowledge_skips_generic_image_only_query() -> None:
    assert (
        should_retrieve_knowledge(
            "帮我看看这张图",
            attachments=[{"type": "image"}],
        )
        is False
    )


def test_build_retrieval_where_filter_combines_space_and_attachment_scope() -> None:
    where = build_retrieval_where_filter(
        3,
        [{"document_revision_id": 2}, {"document_revision_id": 5}],
    )

    assert where == {
        "$and": [
            {"space_id": 3},
            {"document_revision_id": {"$in": [2, 5]}},
        ]
    }
