"""文档相关服务模块。"""

from dataclasses import dataclass
from pathlib import Path
from uuid import uuid4

from knowledge_chatbox_api.services.documents.constants import (
    DOCX_DOCUMENT_FILE_TYPES,
    IMAGE_DOCUMENT_FILE_TYPES,
    MARKDOWN_DOCUMENT_FILE_TYPES,
    TEXT_DOCUMENT_FILE_TYPES,
)
from knowledge_chatbox_api.services.documents.errors import UnsupportedFileTypeError
from knowledge_chatbox_api.services.documents.parsers import (
    DocumentParser,
    DocxDocumentParser,
    ImageDocumentParser,
    MarkdownDocumentParser,
    PdfDocumentParser,
    TextDocumentParser,
)
from knowledge_chatbox_api.utils.files import ensure_directory


@dataclass
class NormalizationResult:
    """描述标准化结果。"""

    content: str
    media_type: str
    normalized_path: str


class NormalizationService:
    """封装文档标准化逻辑。"""

    def __init__(self, *, normalized_dir: Path, provider=None, provider_settings=None) -> None:
        self.normalized_dir = ensure_directory(normalized_dir)
        self.parsers = self._build_parsers(provider=provider, provider_settings=provider_settings)

    def normalize(self, file_path: Path, file_type: str) -> NormalizationResult:
        """处理Normalize相关逻辑。"""
        normalized_type = file_type.lower()
        parser = self.parsers.get(normalized_type)
        if parser is None:
            raise UnsupportedFileTypeError(f"Unsupported file type: {file_type}")

        parsed = parser.parse(file_path)
        return self._persist(file_path, parsed.content, parsed.media_type)

    def _build_parsers(
        self,
        *,
        provider=None,
        provider_settings=None,
    ) -> dict[str, DocumentParser]:
        parsers: dict[str, DocumentParser] = {
            file_type: TextDocumentParser() for file_type in TEXT_DOCUMENT_FILE_TYPES
        }
        parsers.update(
            {file_type: MarkdownDocumentParser() for file_type in MARKDOWN_DOCUMENT_FILE_TYPES}
        )
        parsers["pdf"] = PdfDocumentParser()
        parsers.update({file_type: DocxDocumentParser() for file_type in DOCX_DOCUMENT_FILE_TYPES})
        image_parser = ImageDocumentParser(
            provider=provider,
            provider_settings=provider_settings,
        )
        parsers.update({file_type: image_parser for file_type in IMAGE_DOCUMENT_FILE_TYPES})
        return parsers

    def _persist(self, source_path: Path, content: str, media_type: str) -> NormalizationResult:
        output_path = self.normalized_dir / f"{source_path.stem}-{uuid4().hex}.md"
        output_path.write_text(content, encoding="utf-8")
        return NormalizationResult(
            content=content,
            media_type=media_type,
            normalized_path=str(output_path),
        )
