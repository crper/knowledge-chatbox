"""文档类型与 MIME 映射工具。"""

import mimetypes

mimetypes.add_type("text/markdown", ".md")
mimetypes.add_type("text/markdown", ".markdown")

_CUSTOM_MIME_OVERRIDES: dict[str, str] = {
    "md": "text/markdown",
    "markdown": "text/markdown",
}

FILE_TYPE_TO_MIME_TYPE: dict[str, str] = {}
CONTENT_TYPE_TO_FILE_TYPE: dict[str, str] = {}


def _build_mime_maps() -> None:
    for ext in ("txt", "md", "markdown", "pdf", "docx", "png", "jpg", "jpeg", "webp"):
        mime = _CUSTOM_MIME_OVERRIDES.get(ext) or mimetypes.guess_type(f"file.{ext}")[0]
        if mime:
            FILE_TYPE_TO_MIME_TYPE[ext] = mime
            CONTENT_TYPE_TO_FILE_TYPE.setdefault(mime, ext)


_build_mime_maps()


def guess_mime_type(file_type: str | None) -> str:
    """根据文件类型推导 MIME 类型。"""
    if not isinstance(file_type, str):
        return "application/octet-stream"
    override = _CUSTOM_MIME_OVERRIDES.get(file_type)
    if override:
        return override
    guessed = mimetypes.guess_type(f"file.{file_type}")[0]
    return guessed or "application/octet-stream"


def derive_section_title(content: str) -> str | None:
    """从文档内容首行提取章节标题。"""
    start = 0
    while start < len(content):
        end = content.find("\n", start)
        if end == -1:
            end = len(content)
        line = content[start:end].strip()
        start = end + 1
        if not line:
            continue
        if line.startswith("#"):
            return line.lstrip("#").strip() or None
        return line[:120]
    return None
