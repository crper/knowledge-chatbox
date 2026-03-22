"""Files工具模块。"""

from __future__ import annotations

from pathlib import Path
from uuid import uuid4


def ensure_directory(path: Path) -> Path:
    """确保Directory。"""
    path.mkdir(parents=True, exist_ok=True)
    return path


def build_storage_filename(original_name: str) -> str:
    """构建StorageFilename。"""
    suffix = Path(original_name).suffix
    return f"{uuid4().hex}{suffix}"


def save_bytes(base_dir: Path, original_name: str, content: bytes) -> Path:
    """保存Bytes。"""
    ensure_directory(base_dir)
    output_path = base_dir / build_storage_filename(original_name)
    output_path.write_bytes(content)
    return output_path
