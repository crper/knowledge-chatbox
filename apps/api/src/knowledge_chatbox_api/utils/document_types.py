"""文档类型与 MIME 映射工具。"""

import mimetypes

mimetypes.add_type("text/markdown", ".md")
mimetypes.add_type("text/markdown", ".markdown")


def guess_mime_type(file_type: str | None) -> str:
    """根据文件类型推导 MIME 类型。"""
    if not isinstance(file_type, str):
        return "application/octet-stream"
    return mimetypes.types_map.get(f".{file_type}", "application/octet-stream")


def guess_file_type_from_content_type(content_type: str) -> str | None:
    """根据 MIME 类型推导文件扩展名。"""
    ext = mimetypes.guess_extension(content_type)
    return ext.lstrip(".") if ext else None


def derive_section_title(content: str) -> str | None:
    """从文档内容首行提取章节标题。"""
    for line in content.splitlines():
        line = line.strip()
        if not line:
            continue
        if line.startswith("#"):
            return line.lstrip("#").strip() or None
        return line[:120]
    return None
