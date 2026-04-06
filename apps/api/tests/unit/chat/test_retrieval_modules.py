from __future__ import annotations

from knowledge_chatbox_api.services.chat.retrieval.policy import (
    build_retrieval_where_filter,
    select_attachment_scoped_records,
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


def test_select_attachment_scoped_records_round_robins_between_revisions() -> None:
    records = [
        {"id": "a-1", "document_revision_id": 1},
        {"id": "a-2", "document_revision_id": 1},
        {"id": "b-1", "document_revision_id": 2},
        {"id": "b-2", "document_revision_id": 2},
    ]

    selected = select_attachment_scoped_records(records, [1, 2])

    assert [record["id"] for record in selected] == ["a-1", "b-1"]
