"""Files工具模块。"""

from __future__ import annotations

import hashlib
from dataclasses import dataclass
from pathlib import Path
from typing import Protocol
from uuid import uuid4

from knowledge_chatbox_api.core.logging import get_logger

logger = get_logger(__name__)


@dataclass(frozen=True)
class PersistedUpload:
    """描述一次已落盘上传工件。"""

    path: Path
    content_hash: str
    file_size: int


class AsyncReadableUpload(Protocol):
    """最小异步上传读取协议。"""

    async def read(self, size: int = -1) -> bytes: ...


def ensure_directory(path: Path) -> Path:
    """确保目录存在。"""
    path.mkdir(parents=True, exist_ok=True)
    return path


def build_storage_filename(original_name: str) -> str:
    """构建存储文件名。"""
    suffix = Path(original_name).suffix
    return f"{uuid4().hex}{suffix}"


def save_bytes(base_dir: Path, original_name: str, content: bytes) -> Path:
    """保存字节数据到文件。"""
    ensure_directory(base_dir)
    output_path = base_dir / build_storage_filename(original_name)
    output_path.write_bytes(content)
    return output_path


async def save_upload_stream(
    base_dir: Path,
    original_name: str,
    upload: AsyncReadableUpload,
    *,
    chunk_size: int = 1024 * 1024,
) -> PersistedUpload:
    """按块把上传流落盘，并增量计算 hash 与大小。"""
    ensure_directory(base_dir)
    output_path = base_dir / build_storage_filename(original_name)
    hasher = hashlib.sha256()
    file_size = 0

    try:
        with output_path.open("wb") as output_file:
            while True:
                chunk = await upload.read(chunk_size)
                if not chunk:
                    break
                output_file.write(chunk)
                hasher.update(chunk)
                file_size += len(chunk)
    except Exception:
        logger.warning(
            "upload_stream_write_failed",
            original_name=original_name,
            output_path=str(output_path),
            bytes_written=file_size,
        )  # type: ignore[call-arg]
        output_path.unlink(missing_ok=True)
        raise

    return PersistedUpload(
        path=output_path,
        content_hash=hasher.hexdigest(),
        file_size=file_size,
    )
