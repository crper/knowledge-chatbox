from __future__ import annotations

import hashlib
from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from pathlib import Path

from knowledge_chatbox_api.utils.files import save_upload_stream


class FakeAsyncUpload:
    def __init__(self, chunks: list[bytes]) -> None:
        self._chunks = list(chunks)
        self.read_sizes: list[int] = []

    async def read(self, size: int = -1) -> bytes:
        self.read_sizes.append(size)
        if not self._chunks:
            return b""
        return self._chunks.pop(0)


async def test_save_upload_stream_persists_bytes_and_hashes_incrementally(tmp_path: Path) -> None:
    upload = FakeAsyncUpload([b"hello ", b"world"])
    result = await save_upload_stream(tmp_path, "note.txt", upload, chunk_size=4)

    expected_bytes = b"hello world"
    assert result.path.exists()
    assert result.path.suffix == ".txt"
    assert result.path.read_bytes() == expected_bytes
    assert result.file_size == len(expected_bytes)
    assert result.content_hash == hashlib.sha256(expected_bytes).hexdigest()
    assert upload.read_sizes == [4, 4, 4]
