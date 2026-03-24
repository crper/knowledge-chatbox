from __future__ import annotations

from io import BytesIO
from pathlib import Path
from types import SimpleNamespace
from typing import Any

from PIL import Image

from knowledge_chatbox_api.models.auth import User
from knowledge_chatbox_api.models.document import Document, DocumentRevision
from knowledge_chatbox_api.repositories.chat_repository import ChatRepository
from knowledge_chatbox_api.repositories.space_repository import SpaceRepository
from knowledge_chatbox_api.services.chat.chat_service import ChatService
from knowledge_chatbox_api.services.documents.chunking_service import ChunkingService
from knowledge_chatbox_api.services.documents.indexing_service import IndexingService
from knowledge_chatbox_api.utils.chroma import InMemoryChromaStore


class ResponseAdapterStub:
    def __init__(self) -> None:
        self.response_calls: list[list[dict[str, Any]]] = []

    def response(self, messages: list[dict[str, Any]], settings) -> str:
        del settings
        self.response_calls.append(messages)
        return "answer from provider"


class EmbeddingAdapterStub:
    def __init__(self) -> None:
        self.embed_calls: list[list[str]] = []

    def embed(self, texts: list[str], settings) -> list[list[float]]:
        del settings
        self.embed_calls.append(texts)
        return [[0.2, 0.8]]


class FailingEmbeddingAdapterStub:
    def __init__(self) -> None:
        self.embed_calls: list[list[str]] = []

    def embed(self, texts: list[str], settings) -> list[list[float]]:
        del settings
        self.embed_calls.append(texts)
        raise RuntimeError("embedding backend unavailable")


def create_user_and_session(migrated_db_session):
    user = User(
        username="alice",
        password_hash="hash",
        role="user",
        status="active",
        theme_preference="system",
    )
    migrated_db_session.add(user)
    migrated_db_session.commit()
    migrated_db_session.refresh(user)

    repository = ChatRepository(migrated_db_session)
    chat_session = repository.create_session(user.id, "Session")
    migrated_db_session.commit()
    migrated_db_session.refresh(chat_session)
    return user, chat_session, repository


def create_document_version(
    migrated_db_session,
    user_id: int,
    *,
    file_name: str = "guide.md",
) -> DocumentRevision:
    knowledge_base = SpaceRepository(migrated_db_session).ensure_personal_space(user_id=user_id)

    document = Document(
        knowledge_base_id=knowledge_base.id,
        name=file_name,
        logical_name=file_name,
        status="active",
        current_version_number=1,
        created_by_user_id=user_id,
        updated_by_user_id=user_id,
    )
    migrated_db_session.add(document)
    migrated_db_session.commit()
    migrated_db_session.refresh(document)

    document_version = DocumentRevision(
        document_id=document.id,
        version_number=1,
        file_name=document.name,
        content_hash="hash-1",
        file_type="md",
        lifecycle_status="indexed",
        origin_path=f"/uploads/{document.name}",
        normalized_path=f"/normalized/{document.name}",
        created_by_user_id=user_id,
        updated_by_user_id=user_id,
    )
    migrated_db_session.add(document_version)
    migrated_db_session.commit()
    migrated_db_session.refresh(document_version)
    return document_version


def create_image_document_version(
    migrated_db_session,
    user_id: int,
    tmp_path: Path,
) -> DocumentRevision:
    knowledge_base = SpaceRepository(migrated_db_session).ensure_personal_space(user_id=user_id)

    document = Document(
        space_id=knowledge_base.id,
        title="image.png",
        logical_name="image.png",
        status="active",
        current_version_number=1,
        created_by_user_id=user_id,
        updated_by_user_id=user_id,
    )
    migrated_db_session.add(document)
    migrated_db_session.commit()
    migrated_db_session.refresh(document)

    image_path = tmp_path / "image.png"
    buffer = BytesIO()
    Image.new("RGB", (8, 8), color="white").save(buffer, format="PNG")
    image_path.write_bytes(buffer.getvalue())

    document_version = DocumentRevision(
        document_id=document.id,
        revision_no=1,
        source_filename=image_path.name,
        mime_type="image/png",
        content_hash="image-hash-1",
        file_type="png",
        ingest_status="indexed",
        source_path=str(image_path),
        normalized_path=str(image_path),
        created_by_user_id=user_id,
        updated_by_user_id=user_id,
    )
    migrated_db_session.add(document_version)
    migrated_db_session.commit()
    migrated_db_session.refresh(document_version)
    return document_version


def build_image_attachment(document_version: DocumentRevision) -> list[dict[str, Any]]:
    return [
        {
            "attachment_id": "att-1",
            "type": "image",
            "name": "image.png",
            "mime_type": "image/png",
            "size_bytes": 1,
            "resource_document_id": document_version.document_id,
            "resource_document_version_id": document_version.id,
            "document_revision_id": document_version.id,
        }
    ]


def build_document_attachment(
    document_version: DocumentRevision,
    *,
    attachment_id: str,
) -> dict[str, Any]:
    return {
        "attachment_id": attachment_id,
        "type": "document",
        "name": document_version.file_name,
        "mime_type": document_version.mime_type,
        "size_bytes": 1,
        "resource_document_id": document_version.document_id,
        "resource_document_version_id": document_version.id,
        "document_revision_id": document_version.id,
    }


def create_prompt_document_version(
    migrated_db_session,
    user_id: int,
    *,
    tmp_path: Path,
    file_name: str,
    content: str,
) -> DocumentRevision:
    document_version = create_document_version(
        migrated_db_session,
        user_id,
        file_name=file_name,
    )
    normalized_path = tmp_path / f"{file_name}.normalized.md"
    normalized_path.write_text(content, encoding="utf-8")
    document_version.normalized_path = str(normalized_path)
    document_version.source_path = str(normalized_path)
    migrated_db_session.commit()
    migrated_db_session.refresh(document_version)
    return document_version


def test_chat_service_uses_recent_history_query_for_prompt_assembly() -> None:
    class RecentHistoryRepository:
        def __init__(self) -> None:
            self.requested_limit: int | None = None

        def list_messages(self, session_id: int):
            del session_id
            raise AssertionError("ChatService should not load full history for prompt assembly.")

        def list_recent_messages(self, session_id: int, *, limit: int):
            del session_id
            self.requested_limit = limit
            return [
                SimpleNamespace(role="assistant", content="message-3"),
                SimpleNamespace(role="user", content="message-4"),
                SimpleNamespace(role="assistant", content="message-5"),
                SimpleNamespace(role="user", content="message-6"),
            ]

        def get_session(self, session_id: int):
            del session_id
            return SimpleNamespace(space_id=1)

    repository = RecentHistoryRepository()
    service = ChatService(
        session=None,
        chat_repository=repository,
        chroma_store=InMemoryChromaStore(),
        response_adapter=ResponseAdapterStub(),
        embedding_adapter=EmbeddingAdapterStub(),
        settings=type(
            "SettingsStub",
            (),
            {
                "active_index_generation": 1,
                "system_prompt": None,
                "provider_profiles": {},
                "embedding_route": {"provider": "openai", "model": "text-embedding-3-small"},
            },
        )(),
    )

    prompt_messages, sources = service.build_prompt_messages_and_sources(1, "hello")

    assert repository.requested_limit == 4
    assert sources == []
    assert prompt_messages == [
        {"role": "assistant", "content": "message-3"},
        {"role": "user", "content": "message-4"},
        {"role": "assistant", "content": "message-5"},
        {"role": "user", "content": "message-6"},
        {"role": "user", "content": "hello"},
    ]


def test_chat_service_uses_embedding_adapter_for_query_and_returns_sources(
    migrated_db_session,
) -> None:
    _, chat_session, repository = create_user_and_session(migrated_db_session)
    response_adapter = ResponseAdapterStub()
    embedding_adapter = EmbeddingAdapterStub()
    chroma_store = InMemoryChromaStore()
    indexing_service = IndexingService(
        session=migrated_db_session,
        chunking_service=ChunkingService(max_chunk_length=80, overlap=10),
        chroma_store=chroma_store,
        embedding_provider=embedding_adapter,
        settings=type("SettingsStub", (), {"active_index_generation": 1})(),
    )
    document_version = create_document_version(migrated_db_session, chat_session.user_id)
    indexing_service.index_document(
        document_version,
        "OpenAI provider setup guide.\n\nEmbedding model tips.",
        section_title="Guide",
        page_number=3,
    )
    embedding_adapter.embed_calls.clear()

    service = ChatService(
        session=migrated_db_session,
        chat_repository=repository,
        chroma_store=chroma_store,
        response_adapter=response_adapter,
        embedding_adapter=embedding_adapter,
        settings=type(
            "SettingsStub",
            (),
            {
                "active_index_generation": 1,
                "system_prompt": None,
                "provider_profiles": {},
                "embedding_route": {"provider": "openai", "model": "text-embedding-3-small"},
            },
        )(),
    )
    result = service.answer_question(chat_session.id, "How do I set up OpenAI?")

    assert embedding_adapter.embed_calls == [["How do I set up OpenAI?"]]
    assert result["answer"] == "answer from provider"
    assert result["sources"]
    assert response_adapter.response_calls


def test_chat_service_skips_retrieval_when_embedding_generation_fails(
    migrated_db_session,
) -> None:
    _, chat_session, repository = create_user_and_session(migrated_db_session)
    response_adapter = ResponseAdapterStub()
    embedding_adapter = FailingEmbeddingAdapterStub()
    create_document_version(migrated_db_session, chat_session.user_id)

    class RetrievalMustNotRunChromaStore:
        def query(self, *_args, **_kwargs):
            raise AssertionError(
                "retrieval query should be skipped when embedding generation fails"
            )

    service = ChatService(
        session=migrated_db_session,
        chat_repository=repository,
        chroma_store=RetrievalMustNotRunChromaStore(),
        response_adapter=response_adapter,
        embedding_adapter=embedding_adapter,
        settings=type(
            "SettingsStub",
            (),
            {
                "active_index_generation": 1,
                "system_prompt": None,
                "provider_profiles": {},
                "embedding_route": {"provider": "openai", "model": "text-embedding-3-small"},
            },
        )(),
    )

    result = service.answer_question(chat_session.id, "How do I set up OpenAI?")

    assert embedding_adapter.embed_calls == [["How do I set up OpenAI?"]]
    assert result["answer"] == "answer from provider"
    assert result["sources"] == []
    assert response_adapter.response_calls


def test_chat_service_limits_retrieval_to_current_attachment_revisions(
    migrated_db_session,
) -> None:
    _, chat_session, repository = create_user_and_session(migrated_db_session)
    response_adapter = ResponseAdapterStub()
    embedding_adapter = EmbeddingAdapterStub()
    first_document_version = create_document_version(migrated_db_session, chat_session.user_id)
    second_document_version = create_document_version(
        migrated_db_session,
        chat_session.user_id,
        file_name="poems.md",
    )

    class CaptureWhereChromaStore:
        def __init__(self) -> None:
            self.calls: list[dict[str, Any] | None] = []

        def query(self, *_args, **kwargs):
            self.calls.append(kwargs.get("where"))
            return []

    chroma_store = CaptureWhereChromaStore()
    service = ChatService(
        session=migrated_db_session,
        chat_repository=repository,
        chroma_store=chroma_store,
        response_adapter=response_adapter,
        embedding_adapter=embedding_adapter,
        settings=type(
            "SettingsStub",
            (),
            {
                "active_index_generation": 1,
                "system_prompt": None,
                "provider_profiles": {},
                "embedding_route": {"provider": "openai", "model": "text-embedding-3-small"},
            },
        )(),
    )

    service.answer_question(
        chat_session.id,
        "里面有什么诗歌？",
        attachments=[
            build_document_attachment(first_document_version, attachment_id="att-1"),
            build_document_attachment(second_document_version, attachment_id="att-2"),
        ],
    )

    assert chroma_store.calls == [
        {
            "$and": [
                {"space_id": chat_session.space_id},
                {"document_revision_id": first_document_version.id},
            ]
        },
        {
            "$and": [
                {"space_id": chat_session.space_id},
                {"document_revision_id": second_document_version.id},
            ]
        },
    ]


def test_chat_service_retrieval_scope_filters_in_memory_results_by_attachment_revisions(
    migrated_db_session,
) -> None:
    _, chat_session, repository = create_user_and_session(migrated_db_session)
    response_adapter = ResponseAdapterStub()
    embedding_adapter = EmbeddingAdapterStub()
    chroma_store = InMemoryChromaStore()
    indexing_service = IndexingService(
        session=migrated_db_session,
        chunking_service=ChunkingService(max_chunk_length=80, overlap=10),
        chroma_store=chroma_store,
        embedding_provider=embedding_adapter,
        settings=type("SettingsStub", (), {"active_index_generation": 1})(),
    )
    matched_document_version = create_document_version(
        migrated_db_session,
        chat_session.user_id,
        file_name="poems.md",
    )
    ignored_document_version = create_document_version(
        migrated_db_session,
        chat_session.user_id,
        file_name="manual.md",
    )
    indexing_service.index_document(
        matched_document_version,
        "夜航诗歌合集，收录了 moon tide 和 harbor song。",
        section_title="Poems",
        page_number=1,
    )
    indexing_service.index_document(
        ignored_document_version,
        "OpenClaw 平台接入说明，主要讲 provider 配置。",
        section_title="Guide",
        page_number=2,
    )
    embedding_adapter.embed_calls.clear()

    service = ChatService(
        session=migrated_db_session,
        chat_repository=repository,
        chroma_store=chroma_store,
        response_adapter=response_adapter,
        embedding_adapter=embedding_adapter,
        settings=type(
            "SettingsStub",
            (),
            {
                "active_index_generation": 1,
                "system_prompt": None,
                "provider_profiles": {},
                "embedding_route": {"provider": "openai", "model": "text-embedding-3-small"},
            },
        )(),
    )

    result = service.answer_question(
        chat_session.id,
        "里面有什么诗歌？",
        attachments=[build_document_attachment(matched_document_version, attachment_id="att-1")],
    )

    assert [source["document_revision_id"] for source in result["sources"]] == [
        matched_document_version.id
    ]


def test_chat_service_queries_each_attachment_revision_when_multiple_documents_are_attached(
    migrated_db_session,
) -> None:
    _, chat_session, repository = create_user_and_session(migrated_db_session)
    response_adapter = ResponseAdapterStub()
    embedding_adapter = EmbeddingAdapterStub()
    chroma_store = InMemoryChromaStore()
    indexing_service = IndexingService(
        session=migrated_db_session,
        chunking_service=ChunkingService(max_chunk_length=40, overlap=0),
        chroma_store=chroma_store,
        embedding_provider=embedding_adapter,
        settings=type("SettingsStub", (), {"active_index_generation": 1})(),
    )
    dominant_document_version = create_document_version(
        migrated_db_session,
        chat_session.user_id,
        file_name="dominant.md",
    )
    secondary_document_version = create_document_version(
        migrated_db_session,
        chat_session.user_id,
        file_name="secondary.md",
    )
    indexing_service.index_document(
        dominant_document_version,
        (
            "poem river dawn stanza alpha\n\n"
            "poem river dusk stanza beta\n\n"
            "poem river harbor stanza gamma\n\n"
            "poem river moon stanza delta"
        ),
        section_title="Dominant",
        page_number=1,
    )
    indexing_service.index_document(
        secondary_document_version,
        "poem garden window stanza epsilon",
        section_title="Secondary",
        page_number=2,
    )
    embedding_adapter.embed_calls.clear()

    service = ChatService(
        session=migrated_db_session,
        chat_repository=repository,
        chroma_store=chroma_store,
        response_adapter=response_adapter,
        embedding_adapter=embedding_adapter,
        settings=type(
            "SettingsStub",
            (),
            {
                "active_index_generation": 1,
                "system_prompt": None,
                "provider_profiles": {},
                "embedding_route": {"provider": "openai", "model": "text-embedding-3-small"},
            },
        )(),
    )

    result = service.answer_question(
        chat_session.id,
        "poem",
        attachments=[
            build_document_attachment(dominant_document_version, attachment_id="att-1"),
            build_document_attachment(secondary_document_version, attachment_id="att-2"),
        ],
    )

    assert {source["document_revision_id"] for source in result["sources"]} == {
        dominant_document_version.id,
        secondary_document_version.id,
    }


def test_chat_service_matches_spaced_ascii_query_against_compound_document_term(
    migrated_db_session,
) -> None:
    _, chat_session, repository = create_user_and_session(migrated_db_session)
    response_adapter = ResponseAdapterStub()
    embedding_adapter = EmbeddingAdapterStub()
    chroma_store = InMemoryChromaStore()
    indexing_service = IndexingService(
        session=migrated_db_session,
        chunking_service=ChunkingService(max_chunk_length=80, overlap=10),
        chroma_store=chroma_store,
        embedding_provider=embedding_adapter,
        settings=type("SettingsStub", (), {"active_index_generation": 1})(),
    )
    document_version = create_document_version(
        migrated_db_session,
        chat_session.user_id,
        file_name="openclaw-guide.md",
    )
    indexing_service.index_document(
        document_version,
        "OpenClaw skill marketplace with 12000+ skills and agent workflow tooling.",
        section_title="Overview",
        page_number=1,
    )
    embedding_adapter.embed_calls.clear()

    service = ChatService(
        session=migrated_db_session,
        chat_repository=repository,
        chroma_store=chroma_store,
        response_adapter=response_adapter,
        embedding_adapter=embedding_adapter,
        settings=type(
            "SettingsStub",
            (),
            {
                "active_index_generation": 1,
                "system_prompt": None,
                "provider_profiles": {},
                "embedding_route": {"provider": "openai", "model": "text-embedding-3-small"},
            },
        )(),
    )

    result = service.answer_question(chat_session.id, "open claw")

    assert [source["document_revision_id"] for source in result["sources"]] == [document_version.id]


def test_chat_service_includes_current_turn_document_attachment_text_in_prompt(
    migrated_db_session,
    tmp_path: Path,
) -> None:
    _, chat_session, repository = create_user_and_session(migrated_db_session)
    response_adapter = ResponseAdapterStub()
    embedding_adapter = EmbeddingAdapterStub()
    first_document_version = create_prompt_document_version(
        migrated_db_session,
        chat_session.user_id,
        tmp_path=tmp_path,
        file_name="02-south-window.md",
        content="# 南窗备忘\n午后的屋子没有人说话。",
    )
    second_document_version = create_prompt_document_version(
        migrated_db_session,
        chat_session.user_id,
        tmp_path=tmp_path,
        file_name="04-brick-lane-letter.docx",
        content="# Brick Lane Letter\nCobblestone street and a folded letter.",
    )

    class RetrievalMustNotRunChromaStore:
        def query(self, *_args, **_kwargs):
            raise AssertionError(
                "attached document prompt blocks should not require retrieval here"
            )

    service = ChatService(
        session=migrated_db_session,
        chat_repository=repository,
        chroma_store=RetrievalMustNotRunChromaStore(),
        response_adapter=response_adapter,
        embedding_adapter=embedding_adapter,
        settings=type(
            "SettingsStub",
            (),
            {
                "system_prompt": None,
                "active_index_generation": 1,
                "provider_profiles": {},
                "embedding_route": {"provider": "openai", "model": "text-embedding-3-small"},
            },
        )(),
    )

    service.answer_question(
        chat_session.id,
        "",
        attachments=[
            build_document_attachment(first_document_version, attachment_id="att-1"),
            build_document_attachment(second_document_version, attachment_id="att-2"),
        ],
    )

    user_message = response_adapter.response_calls[0][-1]
    assert isinstance(user_message["content"], list)
    assert user_message["content"][0] == {
        "type": "text",
        "text": "Summarize the attached documents.",
    }
    attached_document_blocks = [
        item["text"]
        for item in user_message["content"][1:]
        if isinstance(item, dict) and item.get("type") == "text"
    ]
    assert any(
        "02-south-window.md" in block and "南窗备忘" in block for block in attached_document_blocks
    )
    assert any(
        "04-brick-lane-letter.docx" in block and "Brick Lane Letter" in block
        for block in attached_document_blocks
    )


def test_chat_service_without_attachments_keeps_space_scoped_retrieval(
    migrated_db_session,
) -> None:
    _, chat_session, repository = create_user_and_session(migrated_db_session)
    response_adapter = ResponseAdapterStub()
    embedding_adapter = EmbeddingAdapterStub()
    create_document_version(migrated_db_session, chat_session.user_id)

    class CaptureWhereChromaStore:
        def __init__(self) -> None:
            self.calls: list[dict[str, Any] | None] = []

        def query(self, *_args, **kwargs):
            self.calls.append(kwargs.get("where"))
            return []

    chroma_store = CaptureWhereChromaStore()
    service = ChatService(
        session=migrated_db_session,
        chat_repository=repository,
        chroma_store=chroma_store,
        response_adapter=response_adapter,
        embedding_adapter=embedding_adapter,
        settings=type(
            "SettingsStub",
            (),
            {
                "active_index_generation": 1,
                "system_prompt": None,
                "provider_profiles": {},
                "embedding_route": {"provider": "openai", "model": "text-embedding-3-small"},
            },
        )(),
    )

    service.answer_question(chat_session.id, "OpenAI 怎么配置？")

    assert chroma_store.calls == [{"space_id": chat_session.space_id}]


def test_chat_service_includes_saved_system_prompt_before_context(migrated_db_session) -> None:
    _, chat_session, repository = create_user_and_session(migrated_db_session)
    response_adapter = ResponseAdapterStub()
    embedding_adapter = EmbeddingAdapterStub()
    chroma_store = InMemoryChromaStore()
    document_version = create_document_version(migrated_db_session, chat_session.user_id)
    knowledge_base = SpaceRepository(migrated_db_session).get_personal_space(chat_session.user_id)
    assert knowledge_base is not None
    chroma_store.upsert(
        [
            {
                "id": "1:0",
                "document_id": document_version.id,
                "knowledge_base_id": knowledge_base.id,
                "text": "Use the OpenAI base URL and API key for setup.",
                "metadata": {"section_title": "Setup", "page_number": 1},
            }
        ],
        embeddings=[[0.6, 0.4]],
        generation=1,
    )

    service = ChatService(
        session=migrated_db_session,
        chat_repository=repository,
        chroma_store=chroma_store,
        response_adapter=response_adapter,
        embedding_adapter=embedding_adapter,
        settings=type(
            "SettingsStub",
            (),
            {
                "system_prompt": "Answer in concise Chinese.",
                "active_index_generation": 1,
                "provider_profiles": {},
                "embedding_route": {"provider": "openai", "model": "text-embedding-3-small"},
            },
        )(),
    )
    service.answer_question(chat_session.id, "How do I set up OpenAI?")

    prompt_messages = response_adapter.response_calls[0]

    assert prompt_messages[0] == {"role": "system", "content": "Answer in concise Chinese."}
    assert prompt_messages[1]["role"] == "system"
    assert "Use the OpenAI base URL and API key for setup." in prompt_messages[1]["content"]


def test_chat_service_ignores_low_score_irrelevant_retrieval_hits(migrated_db_session) -> None:
    _, chat_session, repository = create_user_and_session(migrated_db_session)
    response_adapter = ResponseAdapterStub()
    embedding_adapter = EmbeddingAdapterStub()
    document_version = create_document_version(migrated_db_session, chat_session.user_id)
    knowledge_base = SpaceRepository(migrated_db_session).get_personal_space(chat_session.user_id)
    assert knowledge_base is not None

    class LowScoreChromaStore:
        def query(self, *_args, **_kwargs):
            return [
                {
                    "id": "1:0",
                    "document_id": document_version.id,
                    "knowledge_base_id": knowledge_base.id,
                    "text": "Unrelated historical fragment.",
                    "metadata": {"section_title": "Archive", "page_number": 1},
                    "score": 0.05,
                }
            ]

    service = ChatService(
        session=migrated_db_session,
        chat_repository=repository,
        chroma_store=LowScoreChromaStore(),
        response_adapter=response_adapter,
        embedding_adapter=embedding_adapter,
        settings=type(
            "SettingsStub",
            (),
            {
                "system_prompt": None,
                "active_index_generation": 1,
                "provider_profiles": {},
                "embedding_route": {"provider": "openai", "model": "text-embedding-3-small"},
            },
        )(),
    )

    result = service.answer_question(chat_session.id, "这两个图片说了什么")

    assert result["sources"] == []
    assert response_adapter.response_calls
    assert all(
        not (
            message["role"] == "system"
            and isinstance(message["content"], str)
            and message["content"].startswith("Use the following knowledge base context")
        )
        for message in response_adapter.response_calls[0]
    )


def test_chat_service_ignores_weak_vector_hits_below_relevance_threshold(
    migrated_db_session,
) -> None:
    _, chat_session, repository = create_user_and_session(migrated_db_session)
    response_adapter = ResponseAdapterStub()
    embedding_adapter = EmbeddingAdapterStub()
    document_version = create_document_version(migrated_db_session, chat_session.user_id)
    knowledge_base = SpaceRepository(migrated_db_session).get_personal_space(chat_session.user_id)
    assert knowledge_base is not None

    class WeakScoreChromaStore:
        def query(self, *_args, **_kwargs):
            return [
                {
                    "id": "1:0",
                    "document_id": document_version.id,
                    "knowledge_base_id": knowledge_base.id,
                    "text": "Completely unrelated archive fragment.",
                    "metadata": {"section_title": "Archive", "page_number": 1},
                    "score": 0.35,
                }
            ]

    service = ChatService(
        session=migrated_db_session,
        chat_repository=repository,
        chroma_store=WeakScoreChromaStore(),
        response_adapter=response_adapter,
        embedding_adapter=embedding_adapter,
        settings=type(
            "SettingsStub",
            (),
            {
                "system_prompt": None,
                "active_index_generation": 1,
                "provider_profiles": {},
                "embedding_route": {"provider": "openai", "model": "text-embedding-3-small"},
            },
        )(),
    )

    result = service.answer_question(chat_session.id, "你好啊")

    assert result["sources"] == []
    assert response_adapter.response_calls
    assert all(
        not (
            message["role"] == "system"
            and isinstance(message["content"], str)
            and message["content"].startswith("Use the following knowledge base context")
        )
        for message in response_adapter.response_calls[0]
    )


def test_chat_service_skips_retrieval_for_small_talk_queries(
    migrated_db_session,
) -> None:
    _, chat_session, repository = create_user_and_session(migrated_db_session)
    response_adapter = ResponseAdapterStub()
    embedding_adapter = EmbeddingAdapterStub()
    document_version = create_document_version(migrated_db_session, chat_session.user_id)
    knowledge_base = SpaceRepository(migrated_db_session).get_personal_space(chat_session.user_id)
    assert knowledge_base is not None

    class HighScoreChromaStore:
        def query(self, *_args, **_kwargs):
            return [
                {
                    "id": "1:0",
                    "document_id": document_version.id,
                    "knowledge_base_id": knowledge_base.id,
                    "text": "Completely unrelated archive fragment.",
                    "metadata": {"section_title": "Archive", "page_number": 1},
                    "score": 0.99,
                }
            ]

    service = ChatService(
        session=migrated_db_session,
        chat_repository=repository,
        chroma_store=HighScoreChromaStore(),
        response_adapter=response_adapter,
        embedding_adapter=embedding_adapter,
        settings=type(
            "SettingsStub",
            (),
            {
                "system_prompt": None,
                "active_index_generation": 1,
                "provider_profiles": {},
                "embedding_route": {"provider": "openai", "model": "text-embedding-3-small"},
            },
        )(),
    )

    result = service.answer_question(chat_session.id, "你好啊")

    assert embedding_adapter.embed_calls == []
    assert result["sources"] == []
    assert response_adapter.response_calls
    assert all(
        not (
            message["role"] == "system"
            and isinstance(message["content"], str)
            and message["content"].startswith("Use the following knowledge base context")
        )
        for message in response_adapter.response_calls[0]
    )


def test_chat_service_skips_retrieval_for_empty_text_image_only_turns(
    migrated_db_session,
    tmp_path: Path,
) -> None:
    _, chat_session, repository = create_user_and_session(migrated_db_session)
    response_adapter = ResponseAdapterStub()
    embedding_adapter = EmbeddingAdapterStub()
    image_document_version = create_image_document_version(
        migrated_db_session,
        chat_session.user_id,
        tmp_path,
    )

    class RetrievalMustNotRunChromaStore:
        def query(self, *_args, **_kwargs):
            raise AssertionError("image-only analyze turns should not query retrieval")

    service = ChatService(
        session=migrated_db_session,
        chat_repository=repository,
        chroma_store=RetrievalMustNotRunChromaStore(),
        response_adapter=response_adapter,
        embedding_adapter=embedding_adapter,
        settings=type(
            "SettingsStub",
            (),
            {
                "system_prompt": None,
                "active_index_generation": 1,
                "provider_profiles": {},
                "embedding_route": {"provider": "openai", "model": "text-embedding-3-small"},
            },
        )(),
    )

    result = service.answer_question(
        chat_session.id,
        "",
        attachments=build_image_attachment(image_document_version),
    )

    assert embedding_adapter.embed_calls == []
    assert result["sources"] == []
    assert response_adapter.response_calls
    user_message = response_adapter.response_calls[0][-1]
    assert isinstance(user_message["content"], list)
    assert user_message["content"][0] == {
        "type": "text",
        "text": "Analyze the attached image.",
    }
    assert user_message["content"][1]["type"] == "image"


def test_chat_service_skips_retrieval_for_generic_image_only_prompts(
    migrated_db_session,
    tmp_path: Path,
) -> None:
    _, chat_session, repository = create_user_and_session(migrated_db_session)
    response_adapter = ResponseAdapterStub()
    embedding_adapter = EmbeddingAdapterStub()
    image_document_version = create_image_document_version(
        migrated_db_session,
        chat_session.user_id,
        tmp_path,
    )

    class RetrievalMustNotRunChromaStore:
        def query(self, *_args, **_kwargs):
            raise AssertionError("generic image prompts should not query retrieval")

    service = ChatService(
        session=migrated_db_session,
        chat_repository=repository,
        chroma_store=RetrievalMustNotRunChromaStore(),
        response_adapter=response_adapter,
        embedding_adapter=embedding_adapter,
        settings=type(
            "SettingsStub",
            (),
            {
                "system_prompt": None,
                "active_index_generation": 1,
                "provider_profiles": {},
                "embedding_route": {"provider": "openai", "model": "text-embedding-3-small"},
            },
        )(),
    )

    result = service.answer_question(
        chat_session.id,
        "帮我看看这张图",
        attachments=build_image_attachment(image_document_version),
    )

    assert embedding_adapter.embed_calls == []
    assert result["sources"] == []
    assert response_adapter.response_calls


def test_chat_service_keeps_retrieval_for_specific_questions_with_image_attachments(
    migrated_db_session,
    tmp_path: Path,
) -> None:
    _, chat_session, repository = create_user_and_session(migrated_db_session)
    response_adapter = ResponseAdapterStub()
    embedding_adapter = EmbeddingAdapterStub()
    document_version = create_document_version(migrated_db_session, chat_session.user_id)
    image_document_version = create_image_document_version(
        migrated_db_session,
        chat_session.user_id,
        tmp_path,
    )
    knowledge_base = SpaceRepository(migrated_db_session).get_personal_space(chat_session.user_id)
    assert knowledge_base is not None

    class HighScoreChromaStore:
        def query(self, *_args, **_kwargs):
            return [
                {
                    "id": "1:0",
                    "document_id": document_version.id,
                    "knowledge_base_id": knowledge_base.id,
                    "text": "角色穿着浅青色长裙。",
                    "metadata": {"section_title": "服饰", "page_number": 1},
                    "score": 0.99,
                }
            ]

    service = ChatService(
        session=migrated_db_session,
        chat_repository=repository,
        chroma_store=HighScoreChromaStore(),
        response_adapter=response_adapter,
        embedding_adapter=embedding_adapter,
        settings=type(
            "SettingsStub",
            (),
            {
                "system_prompt": None,
                "active_index_generation": 1,
                "provider_profiles": {},
                "embedding_route": {"provider": "openai", "model": "text-embedding-3-small"},
            },
        )(),
    )

    result = service.answer_question(
        chat_session.id,
        "图里角色穿的是什么颜色？",
        attachments=build_image_attachment(image_document_version),
    )

    assert embedding_adapter.embed_calls == [["图里角色穿的是什么颜色？"]]
    assert len(result["sources"]) == 1
    assert result["sources"][0]["document_name"] == "guide.md"
