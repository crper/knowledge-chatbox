"""聊天检索与 prompt 构建服务。"""

from __future__ import annotations

import base64
from io import BytesIO
from pathlib import Path
from typing import Any

from PIL import Image, ImageOps, UnidentifiedImageError
from sqlalchemy import and_, or_, select

from knowledge_chatbox_api.models.document import Document, DocumentRevision
from knowledge_chatbox_api.providers.factory import build_embedding_adapter_from_settings
from knowledge_chatbox_api.repositories.chat_repository import ChatRepository
from knowledge_chatbox_api.repositories.document_repository import DocumentRepository
from knowledge_chatbox_api.utils.chroma import (
    _normalize_match_text,
    _quoted_phrases,
    _tokenize_text,
)
from knowledge_chatbox_api.utils.embedding_cache import CachedEmbeddingProvider

IMAGE_ANALYZE_FALLBACK_PROMPT = "Analyze the attached image."
DOCUMENT_ANALYZE_FALLBACK_PROMPT = "Summarize the attached documents."
IMAGE_ATTACHMENT_PROCESSING_ERROR_MESSAGE = (
    "Attached image could not be processed. Make sure the image opens normally and retry with a "
    "vision-capable model."
)
DOCUMENT_ATTACHMENT_PROCESSING_ERROR_MESSAGE = (
    "Attached document could not be processed. Make sure it was indexed successfully and retry."
)
ATTACHED_DOCUMENT_PROMPT_CHAR_LIMIT = 6000
PROMPT_HISTORY_MESSAGE_LIMIT = 4
MIN_RETRIEVAL_SOURCE_SCORE = 0.45
SMALL_TALK_QUERIES = {
    "hello",
    "hey",
    "hi",
    "ok",
    "okay",
    "你好",
    "你好啊",
    "你好呀",
    "再见",
    "有人吗",
    "哈喽",
    "嗨",
    "在吗",
    "在不在",
    "晚上好",
    "晚安",
    "早上好",
    "早安",
    "下午好",
    "收到",
    "拜拜",
    "谢谢",
    "谢谢你",
    "多谢",
    "好的",
    "您好",
}
GENERIC_IMAGE_ONLY_QUERIES = {
    _normalize_match_text(value)
    for value in {
        "帮我看看这张图",
        "帮我看看这幅图",
        "看看这张图",
        "看看这幅图",
        "描述这张图",
        "描述这幅图",
        "分析这张图",
        "分析这幅图",
        "这张图说了什么",
        "这幅图说了什么",
        "describe this image",
        "analyze this image",
        "look at this image",
        "what does this image say",
    }
}


class ChatService:
    """封装聊天问答主流程。"""

    def __init__(
        self,
        *,
        session,
        chat_repository: ChatRepository,
        chroma_store,
        response_adapter,
        embedding_adapter,
        settings,
    ) -> None:
        self.session = session
        self.chat_repository = chat_repository
        self.chroma_store = chroma_store
        self.response_adapter = response_adapter
        self.settings = settings
        self.document_repository = DocumentRepository(session)
        # 包装 embedding adapter 添加缓存层
        raw_adapter = embedding_adapter or self._get_embedding_adapter()
        self.embedding_adapter = CachedEmbeddingProvider(raw_adapter)

    def answer_question(
        self, session_id: int, question: str, attachments: list[dict[str, Any]] | None = None
    ) -> dict:
        prompt_messages, sources = self.build_prompt_messages_and_sources(
            session_id,
            question,
            attachments=attachments,
        )
        answer = self.response_adapter.response(prompt_messages, self.settings)
        return {"answer": answer, "sources": sources}

    def build_prompt_messages_and_sources(
        self,
        session_id: int,
        question: str,
        *,
        attachments: list[dict[str, Any]] | None = None,
    ) -> tuple[list[dict[str, Any]], list[dict]]:
        history = self.chat_repository.list_recent_messages(
            session_id,
            limit=PROMPT_HISTORY_MESSAGE_LIMIT,
        )
        chat_session = self.chat_repository.get_session(session_id)
        active_space_id = chat_session.space_id if chat_session is not None else None
        prompt_attachments = self._build_prompt_attachments(attachments, active_space_id)
        prompt_text = self._resolve_prompt_text(question, attachments)
        retrieval_query_text = question.strip()
        attachment_revision_ids = sorted(self._collect_attachment_revision_ids(attachments))
        where_filter = self._build_retrieval_where_filter(active_space_id, attachments)
        should_retrieve = self._should_retrieve_knowledge(
            retrieval_query_text,
            attachments=attachments,
        )
        if should_retrieve and self._has_retrievable_documents(active_space_id):
            embedding_adapter = self.embedding_adapter or self._get_embedding_adapter()
            generation = getattr(self.settings, "active_index_generation", 1)
            try:
                embeddings = embedding_adapter.embed([retrieval_query_text], self.settings)
            except Exception:  # noqa: BLE001
                embeddings = []
            query_embedding = embeddings[0] if embeddings else None
            retrieved_chunks = self._query_retrieved_chunks(
                retrieval_query_text,
                active_space_id=active_space_id,
                attachment_revision_ids=attachment_revision_ids,
                generation=generation,
                query_embedding=query_embedding,
                where_filter=where_filter,
            )
        else:
            retrieved_chunks = []
        retrieved_chunks = [
            record
            for record in retrieved_chunks
            if self._is_relevant_retrieval_hit(record, retrieval_query_text)
        ]

        versions_by_id, documents_by_id = self._load_retrieved_document_context(retrieved_chunks)
        context_sections: list[str] = []
        sources = []

        for record in retrieved_chunks:
            score = record.get("score")
            if isinstance(score, (int, float)) and score < 0.1:
                continue
            revision_id = record.get("document_revision_id", record["document_id"])
            document_version = versions_by_id.get(revision_id)
            if document_version is None:
                document_name = f"Document {record['document_id']}"
                document = None
            else:
                document = documents_by_id.get(document_version.document_id)
                if document is not None and (
                    document.space_id != active_space_id
                    or (
                        document.latest_revision_id != document_version.id
                        and document.current_version_number != document_version.revision_no
                    )
                ):
                    continue
                document_name = (
                    document.logical_name
                    if document is not None
                    else f"Document {record['document_id']}"
                )
            page_number = record["metadata"].get("page_number")
            section_title = record["metadata"].get("section_title")
            context_sections.append(
                "\n".join(
                    filter(
                        None,
                        [
                            f"Document: {document_name}",
                            f"Section: {section_title}" if section_title else None,
                            f"Page: {page_number}" if page_number is not None else None,
                            f"Content: {record['text']}",
                        ],
                    )
                )
            )
            sources.append(
                {
                    "document_id": record["document_id"],
                    "document_revision_id": revision_id,
                    "document_name": document_name,
                    "chunk_id": record["id"],
                    "snippet": record["text"][:240],
                    "page_number": page_number,
                    "section_title": section_title,
                    "score": record["score"],
                }
            )

        prompt_messages: list[dict[str, Any]] = []
        system_prompt = self._system_prompt_content()
        if system_prompt is not None:
            prompt_messages.append({"role": "system", "content": system_prompt})
        if context_sections:
            prompt_messages.append(
                {
                    "role": "system",
                    "content": "Use the following knowledge base context when answering.\n\n"
                    + "\n\n".join(context_sections),
                }
            )
        prompt_messages.extend(
            {"role": message.role, "content": message.content} for message in history
        )
        if not history or history[-1].role != "user" or history[-1].content != question:
            if prompt_attachments:
                user_content: list[dict[str, Any]] = [{"type": "text", "text": prompt_text}]
                user_content.extend(prompt_attachments)
                prompt_messages.append({"role": "user", "content": user_content})
            else:
                prompt_messages.append({"role": "user", "content": question})

        return prompt_messages, sources

    def _system_prompt_content(self) -> str | None:
        content = getattr(self.settings, "system_prompt", None)
        if not isinstance(content, str):
            return None
        normalized = content.strip()
        return normalized or None

    def _has_retrievable_documents(self, space_id: int | None) -> bool:
        if space_id is None:
            return False

        current_version_ids = self.session.scalars(
            select(DocumentRevision.id)
            .join(Document, Document.id == DocumentRevision.document_id)
            .where(
                Document.space_id == space_id,
                Document.status == "active",
                or_(
                    Document.latest_revision_id == DocumentRevision.id,
                    and_(
                        Document.latest_revision_id.is_(None),
                        DocumentRevision.revision_no == Document.current_version_number,
                    ),
                ),
                DocumentRevision.ingest_status == "indexed",
            )
            .limit(1)
        ).first()
        return current_version_ids is not None

    def _load_retrieved_document_context(
        self,
        retrieved_chunks: list[dict[str, Any]],
    ) -> tuple[dict[int, DocumentRevision], dict[int, Document]]:
        version_ids = {
            record.get("document_revision_id", record.get("document_id"))
            for record in retrieved_chunks
            if isinstance(record.get("document_revision_id", record.get("document_id")), int)
        }
        if not version_ids:
            return {}, {}

        versions = list(
            self.session.scalars(
                select(DocumentRevision).where(DocumentRevision.id.in_(version_ids))
            ).all()
        )
        versions_by_id = {version.id: version for version in versions}
        document_ids = {version.document_id for version in versions}
        if not document_ids:
            return versions_by_id, {}

        documents = list(
            self.session.scalars(select(Document).where(Document.id.in_(document_ids))).all()
        )
        documents_by_id = {document.id: document for document in documents}
        return versions_by_id, documents_by_id

    def _get_embedding_adapter(self):
        return build_embedding_adapter_from_settings(self.settings)

    def _should_retrieve_knowledge(
        self,
        query_text: str,
        *,
        attachments: list[dict[str, Any]] | None = None,
    ) -> bool:
        if self._is_image_only_analysis_turn(query_text, attachments):
            return False

        normalized_query = _normalize_match_text(query_text)
        if not normalized_query:
            return False
        return normalized_query not in SMALL_TALK_QUERIES

    def _is_image_only_analysis_turn(
        self,
        query_text: str,
        attachments: list[dict[str, Any]] | None,
    ) -> bool:
        if not self._has_only_image_attachments(attachments):
            return False

        normalized_query = _normalize_match_text(query_text)
        if not normalized_query:
            return True

        return normalized_query in GENERIC_IMAGE_ONLY_QUERIES

    def _has_only_image_attachments(self, attachments: list[dict[str, Any]] | None) -> bool:
        if not attachments:
            return False
        return all(attachment.get("type") == "image" for attachment in attachments)

    def _resolve_prompt_text(
        self,
        question: str,
        attachments: list[dict[str, Any]] | None,
    ) -> str:
        prompt_text = question.strip()
        if prompt_text:
            return prompt_text
        if self._has_only_image_attachments(attachments):
            return IMAGE_ANALYZE_FALLBACK_PROMPT
        if attachments:
            return DOCUMENT_ANALYZE_FALLBACK_PROMPT
        return ""

    def _build_retrieval_where_filter(
        self,
        active_space_id: int | None,
        attachments: list[dict[str, Any]] | None,
    ) -> dict[str, Any] | None:
        conditions: list[dict[str, Any]] = []
        if active_space_id is not None:
            conditions.append({"space_id": active_space_id})

        attachment_revision_ids = sorted(self._collect_attachment_revision_ids(attachments))
        if attachment_revision_ids:
            conditions.append({"document_revision_id": {"$in": attachment_revision_ids}})

        if not conditions:
            return None
        if len(conditions) == 1:
            return conditions[0]
        return {"$and": conditions}

    def _query_retrieved_chunks(
        self,
        query_text: str,
        *,
        active_space_id: int | None,
        attachment_revision_ids: list[int],
        generation: int,
        query_embedding: list[float] | None,
        where_filter: dict[str, Any] | None,
    ) -> list[dict[str, Any]]:
        if len(attachment_revision_ids) <= 1:
            return self.chroma_store.query(
                query_text,
                query_embedding=query_embedding,
                top_k=3,
                generation=generation,
                where=where_filter,
            )

        retrieved_chunks: list[dict[str, Any]] = []
        seen_chunk_ids: set[str] = set()
        for revision_id in attachment_revision_ids:
            revision_where_filter = self._build_revision_scoped_where_filter(
                active_space_id,
                revision_id,
            )
            records = self.chroma_store.query(
                query_text,
                query_embedding=query_embedding,
                top_k=1,
                generation=generation,
                where=revision_where_filter,
            )
            for record in records:
                chunk_id = str(record.get("id", ""))
                if chunk_id in seen_chunk_ids:
                    continue
                seen_chunk_ids.add(chunk_id)
                retrieved_chunks.append(record)
        return retrieved_chunks

    def _build_revision_scoped_where_filter(
        self,
        active_space_id: int | None,
        revision_id: int,
    ) -> dict[str, Any]:
        conditions: list[dict[str, Any]] = [{"document_revision_id": revision_id}]
        if active_space_id is not None:
            conditions.insert(0, {"space_id": active_space_id})
        if len(conditions) == 1:
            return conditions[0]
        return {"$and": conditions}

    def _collect_attachment_revision_ids(
        self,
        attachments: list[dict[str, Any]] | None,
    ) -> set[int]:
        if not attachments:
            return set()

        revision_ids: set[int] = set()
        for attachment in attachments:
            revision_id = attachment.get("document_revision_id")
            if isinstance(revision_id, int):
                revision_ids.add(revision_id)
        return revision_ids

    def _build_prompt_attachments(
        self,
        attachments: list[dict[str, Any]] | None,
        active_space_id: int | None,
    ) -> list[dict[str, Any]]:
        if not attachments:
            return []

        prompt_attachments: list[dict[str, Any]] = []
        for attachment in attachments:
            if attachment.get("type") != "image":
                prompt_attachments.append(
                    self._build_prompt_document_attachment(attachment, active_space_id)
                )
                continue
            prompt_attachments.append(
                self._build_prompt_image_attachment(attachment, active_space_id)
            )
        return prompt_attachments

    def _build_prompt_document_attachment(
        self,
        attachment: dict[str, Any],
        active_space_id: int | None,
    ) -> dict[str, Any]:
        revision_id = attachment.get("document_revision_id")
        if not isinstance(revision_id, int):
            raise ValueError(DOCUMENT_ATTACHMENT_PROCESSING_ERROR_MESSAGE)

        document_version = self.document_repository.get_by_id(revision_id)
        if document_version is None:
            raise ValueError(DOCUMENT_ATTACHMENT_PROCESSING_ERROR_MESSAGE)

        document = self.document_repository.get_document_entity(document_version.document_id)
        if document is None or (
            active_space_id is not None and document.space_id != active_space_id
        ):
            raise ValueError(DOCUMENT_ATTACHMENT_PROCESSING_ERROR_MESSAGE)

        attachment_name = attachment.get("name") or document.logical_name
        try:
            document_text = self._read_attached_document_text(document_version)
        except ValueError:
            document_text = self._build_attached_document_fallback_text(attachment_name)
        return {
            "type": "text",
            "text": f"Attached document: {attachment_name}\n\n{document_text}",
        }

    def _build_prompt_image_attachment(
        self,
        attachment: dict[str, Any],
        active_space_id: int | None,
    ) -> dict[str, Any]:
        revision_id = attachment.get("document_revision_id")
        if not isinstance(revision_id, int):
            raise ValueError(IMAGE_ATTACHMENT_PROCESSING_ERROR_MESSAGE)

        document_version = self.document_repository.get_by_id(revision_id)
        if document_version is None:
            raise ValueError(IMAGE_ATTACHMENT_PROCESSING_ERROR_MESSAGE)

        document = self.document_repository.get_document_entity(document_version.document_id)
        if document is None or (
            active_space_id is not None and document.space_id != active_space_id
        ):
            raise ValueError(IMAGE_ATTACHMENT_PROCESSING_ERROR_MESSAGE)

        source_path = Path(document_version.source_path)
        if not source_path.exists():
            raise ValueError(IMAGE_ATTACHMENT_PROCESSING_ERROR_MESSAGE)

        try:
            data_base64 = self._encode_image_attachment(source_path)
        except (OSError, UnidentifiedImageError, ValueError) as exc:
            raise ValueError(IMAGE_ATTACHMENT_PROCESSING_ERROR_MESSAGE) from exc

        return {
            **attachment,
            "mime_type": "image/jpeg",
            "data_base64": data_base64,
        }

    def _read_attached_document_text(self, document_version: DocumentRevision) -> str:
        candidate_paths = [document_version.normalized_path]
        if document_version.file_type in {"txt", "md", "markdown"}:
            candidate_paths.append(document_version.source_path)

        for candidate_path in candidate_paths:
            if not isinstance(candidate_path, str) or not candidate_path:
                continue
            path = Path(candidate_path)
            if not path.exists():
                continue
            try:
                content = path.read_text(encoding="utf-8").strip()
            except (OSError, UnicodeDecodeError):
                continue
            if content:
                return self._truncate_attached_document_text(content)

        raise ValueError(DOCUMENT_ATTACHMENT_PROCESSING_ERROR_MESSAGE)

    def _truncate_attached_document_text(self, content: str) -> str:
        if len(content) <= ATTACHED_DOCUMENT_PROMPT_CHAR_LIMIT:
            return content
        truncated = content[:ATTACHED_DOCUMENT_PROMPT_CHAR_LIMIT].rstrip()
        return f"{truncated}\n\n[Truncated]"

    def _build_attached_document_fallback_text(self, attachment_name: str) -> str:
        return (
            f"Document content preview is currently unavailable for {attachment_name}. "
            "Use any retrieved context and attachment metadata when answering."
        )

    def _encode_image_attachment(self, source_path: Path) -> str:
        with Image.open(source_path) as source_image:
            prepared_image = ImageOps.exif_transpose(source_image).convert("RGB")
            try:
                prepared_image.thumbnail((2048, 2048))
                buffer = BytesIO()
                prepared_image.save(buffer, format="JPEG", quality=85)
            finally:
                prepared_image.close()

        return base64.b64encode(buffer.getvalue()).decode("utf-8")

    def _is_relevant_retrieval_hit(self, record: dict[str, Any], query_text: str) -> bool:
        score = float(record.get("score", 0.0))
        if score >= MIN_RETRIEVAL_SOURCE_SCORE:
            return True
        return self._has_query_overlap(record, query_text)

    def _has_query_overlap(self, record: dict[str, Any], query_text: str) -> bool:
        query_terms = _tokenize_text(query_text)
        if not query_terms:
            return False

        section_title = record.get("metadata", {}).get("section_title") or ""
        haystack = f"{record.get('text', '')} {section_title}"
        normalized_haystack = _normalize_match_text(haystack)
        normalized_query = _normalize_match_text(query_text)
        query_phrases = _quoted_phrases(query_text)

        if any(phrase in normalized_haystack for phrase in query_phrases):
            return True

        if len(normalized_query) >= 2 and normalized_query in normalized_haystack:
            return True

        return len(query_terms & _tokenize_text(haystack)) > 0
