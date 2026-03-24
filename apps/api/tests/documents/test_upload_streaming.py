from __future__ import annotations

import hashlib

import pytest

from knowledge_chatbox_api.utils import files as file_utils


class FakeAsyncUpload:
    def __init__(self, chunks: list[bytes]) -> None:
        self._chunks = list(chunks)
        self.read_sizes: list[int] = []

    async def read(self, size: int = -1) -> bytes:
        self.read_sizes.append(size)
        if not self._chunks:
            return b""
        return self._chunks.pop(0)


@pytest.mark.anyio
async def test_save_upload_stream_persists_bytes_and_hashes_incrementally(tmp_path) -> None:
    helper = getattr(file_utils, "save_upload_stream", None)
    assert callable(helper), "save_upload_stream helper is missing"

    upload = FakeAsyncUpload([b"hello ", b"world"])
    result = await helper(tmp_path, "note.txt", upload, chunk_size=4)

    expected_bytes = b"hello world"
    assert result.path.exists()
    assert result.path.suffix == ".txt"
    assert result.path.read_bytes() == expected_bytes
    assert result.file_size == len(expected_bytes)
    assert result.content_hash == hashlib.sha256(expected_bytes).hexdigest()
    assert upload.read_sizes == [4, 4, 4]
