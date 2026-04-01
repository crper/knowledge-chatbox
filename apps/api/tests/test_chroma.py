from __future__ import annotations

from knowledge_chatbox_api.utils.chroma import InMemoryChromaStore, PersistentChromaStore


class FakeCollection:
    def __init__(self) -> None:
        self.get_calls: list[dict] = []
        self.query_calls: list[dict] = []

    def query(self, **kwargs):
        self.query_calls.append(kwargs)
        return {
            "ids": [["chunk-a", "chunk-b"]],
            "documents": [
                [
                    "Completely unrelated archive note.",
                    "OpenAI setup guide with exact phrase.",
                ]
            ],
            "metadatas": [
                [
                    {"document_id": 1, "knowledge_base_id": 9},
                    {"document_id": 2, "knowledge_base_id": 9},
                ]
            ],
            "distances": [[0.1, 0.4]],
        }

    def get(self, **kwargs):
        self.get_calls.append(kwargs)
        return {
            "ids": ["fallback-1"],
            "documents": ["OpenAI setup fallback document."],
            "metadatas": [{"document_id": 3, "knowledge_base_id": 9}],
        }


def build_store(collection: FakeCollection) -> PersistentChromaStore:
    store = PersistentChromaStore.__new__(PersistentChromaStore)
    store._collections = {1: collection}
    return store


def test_persistent_chroma_store_reranks_vector_candidates_without_collection_wide_get() -> None:
    collection = FakeCollection()
    store = build_store(collection)

    result = store.query(
        '"OpenAI setup"',
        query_embedding=[0.2, 0.8],
        top_k=2,
        generation=1,
        where={"knowledge_base_id": {"$in": [9]}},
    )

    assert [record["id"] for record in result] == ["chunk-b", "chunk-a"]
    assert collection.get_calls == []
    assert collection.query_calls == [
        {
            "query_embeddings": [[0.2, 0.8]],
            "n_results": 8,
            "include": ["documents", "metadatas", "distances"],
            "where": {"knowledge_base_id": {"$in": [9]}},
        }
    ]


def test_persistent_chroma_store_returns_no_candidates_when_embedding_is_missing() -> None:
    collection = FakeCollection()
    store = build_store(collection)

    result = store.query(
        "OpenAI setup",
        query_embedding=None,
        top_k=1,
        generation=1,
        where={"knowledge_base_id": {"$in": [9]}},
    )

    assert result == []
    assert collection.get_calls == []


def test_persistent_chroma_store_normalizes_compound_where_filters() -> None:
    collection = FakeCollection()
    store = build_store(collection)

    store.query(
        "OpenAI setup",
        query_embedding=[0.2, 0.8],
        top_k=1,
        generation=1,
        where={
            "space_id": 9,
            "document_revision_id": {"$in": [2, 3]},
        },
    )

    assert collection.query_calls == [
        {
            "query_embeddings": [[0.2, 0.8]],
            "n_results": 4,
            "include": ["documents", "metadatas", "distances"],
            "where": {
                "$and": [
                    {"space_id": 9},
                    {"document_revision_id": {"$in": [2, 3]}},
                ]
            },
        }
    ]


def test_in_memory_chroma_store_supports_compound_where_filters() -> None:
    store = InMemoryChromaStore()
    store.upsert(
        [
            {
                "id": "doc-1",
                "document_id": 1,
                "document_revision_id": 2,
                "space_id": 9,
                "text": "OpenAI setup guide",
                "metadata": {"section_title": "Guide"},
            },
            {
                "id": "doc-2",
                "document_id": 2,
                "document_revision_id": 3,
                "space_id": 10,
                "text": "OpenAI setup for another space",
                "metadata": {"section_title": "Guide"},
            },
        ]
    )

    result = store.query(
        "OpenAI setup",
        where={
            "$and": [
                {"space_id": 9},
                {"document_revision_id": {"$in": [2]}},
            ]
        },
    )

    assert [record["id"] for record in result] == ["doc-1"]
