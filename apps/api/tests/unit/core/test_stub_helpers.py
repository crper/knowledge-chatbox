from __future__ import annotations

from tests.fixtures.stubs import EmbeddingAdapterStub, TextResponseAdapterStub


def test_text_response_adapter_stub_captures_messages_and_streams_configured_chunks() -> None:
    adapter = TextResponseAdapterStub(
        sync_answer="同步完成",
        stream_chunks=["甲", "乙"],
        output_tokens=9,
    )

    sync_answer = adapter.response([{"role": "user", "content": "hello"}], settings=None)
    stream_events = list(
        adapter.stream_response(
            [{"role": "user", "content": "hello"}],
            settings=None,
        )
    )

    assert sync_answer == "同步完成"
    assert adapter.last_messages == [{"role": "user", "content": "hello"}]
    assert adapter.stream_calls == 1
    assert stream_events == [
        {"type": "text_delta", "delta": "甲"},
        {"type": "text_delta", "delta": "乙"},
        {"type": "completed", "usage": {"output_tokens": 9}},
    ]


def test_embedding_adapter_stub_uses_configured_vector_values() -> None:
    adapter = EmbeddingAdapterStub(values=[0.1, 0.2, 0.3])

    vectors = adapter.embed(["a", "b"], settings=None)  # pyright: ignore[reportArgumentType]

    assert vectors == [
        [0.1, 0.2, 0.3],
        [0.1, 0.2, 0.3],
    ]
    assert adapter.embed_calls == [["a", "b"]]
