from knowledge_chatbox_api.services.chat.workflow.output import (
    WorkflowSource,
    merge_sources_by_key,
    merge_workflow_sources,
)


def test_merge_workflow_sources_keeps_distinct_fallback_sources() -> None:
    current = [
        WorkflowSource(
            document_id=1,
            document_name="alpha.md",
            page_number=1,
            section_title="A",
            snippet="same snippet",
        )
    ]
    new = [
        WorkflowSource(
            document_id=2,
            document_name="beta.md",
            page_number=2,
            section_title="B",
            snippet="same snippet",
        )
    ]

    merged = merge_workflow_sources(current, new)

    assert len(merged) == 2


def test_merge_sources_by_key_keeps_distinct_fallback_sources() -> None:
    current = [
        {
            "document_id": 1,
            "document_name": "alpha.md",
            "page_number": 1,
            "section_title": "A",
            "snippet": "same snippet",
        }
    ]
    new = [
        {
            "document_id": 2,
            "document_name": "beta.md",
            "page_number": 2,
            "section_title": "B",
            "snippet": "same snippet",
        }
    ]

    merged = merge_sources_by_key(current, new)

    assert len(merged) == 2
