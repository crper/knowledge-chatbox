"""Files工具模块。"""

import hashlib
from pathlib import Path
from typing import Protocol
from uuid import uuid4

from pydantic import BaseModel, ConfigDict

from knowledge_chatbox_api.core.logging import get_logger

logger = get_logger(__name__)


class PersistedUpload(BaseModel):
    """描述一次已落盘上传工件。"""

    model_config = ConfigDict(frozen=True, arbitrary_types_allowed=True)

    path: Path
    content_hash: str
    file_size: int


class AsyncReadableUpload(Protocol):
    """最小异步上传读取协议。"""

    async def read(self, size: int = -1) -> bytes: ...


async def save_upload_stream(
    base_dir: Path,
    original_name: str,
    upload: AsyncReadableUpload,
    *,
    chunk_size: int = 1024 * 1024,
    size_limit: int | None = None,
) -> PersistedUpload:
    """按块把上传流落盘，并增量计算 hash 与大小。"""
    base_dir.mkdir(parents=True, exist_ok=True)
    output_path = base_dir / f"{uuid4().hex}{Path(original_name).suffix}"
    hasher = hashlib.sha256()
    file_size = 0

    try:
        with output_path.open("wb") as output_file:
            while True:
                chunk = await upload.read(chunk_size)
                if not chunk:
                    break
                file_size += len(chunk)
                if size_limit is not None and file_size > size_limit:
                    output_path.unlink(missing_ok=True)
                    raise ValueError(f"File exceeds maximum allowed size of {size_limit} bytes")
                output_file.write(chunk)
                hasher.update(chunk)
    except Exception:
        logger.warning(
            "upload_stream_write_failed",
            original_name=original_name,
            output_path=str(output_path),
            bytes_written=file_size,
        )
        output_path.unlink(missing_ok=True)
        raise

    return PersistedUpload(
        path=output_path,
        content_hash=hasher.hexdigest(),
        file_size=file_size,
    )
