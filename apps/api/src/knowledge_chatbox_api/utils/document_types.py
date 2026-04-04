"""文档类型与 MIME 映射工具。"""

from __future__ import annotations

FILE_TYPE_TO_MIME_TYPE = {
    "txt": "text/plain",
    "md": "text/markdown",
    "markdown": "text/markdown",
    "pdf": "application/pdf",
    "docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "png": "image/png",
    "jpg": "image/jpeg",
    "jpeg": "image/jpeg",
    "webp": "image/webp",
}

CONTENT_TYPE_TO_FILE_TYPE = {
    "text/plain": "txt",
    "text/markdown": "md",
    "application/pdf": "pdf",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "docx",
    "image/png": "png",
    "image/jpeg": "jpg",
    "image/webp": "webp",
}


def guess_mime_type(file_type: str | None) -> str:
    """根据文件类型推导 MIME 类型。"""
    if not isinstance(file_type, str):
        return "application/octet-stream"
    return FILE_TYPE_TO_MIME_TYPE.get(file_type, "application/octet-stream")


def derive_section_title(content: str) -> str | None:
    """从文档内容首行提取章节标题。"""
    for line in content.splitlines():
        stripped = line.strip()
        if not stripped:
            continue
        if stripped.startswith("#"):
            return stripped.lstrip("#").strip() or None
        return stripped[:120]
    return None
