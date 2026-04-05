"""polyfactory 测试数据工厂。

为全部 ORM Model 提供 SQLAlchemyFactory 子类，支持：
- ``.build(**overrides)`` — 构造不落盘的实例
- ``.persisted_create(session, **overrides)`` — 构造并落盘（add → commit → refresh）
- ``.batch(size, ...)`` / ``.persisted_batch(session, size, ...)`` — 批量创建

使用方式::

    from tests.fixtures.factories import UserFactory, ChatSessionFactory

    user = UserFactory.persisted_create(migrated_db_session, username="alice")
    session = ChatSessionFactory.persisted_create(
        migrated_db_session, user_id=user.id, space_id=space.id,
    )
"""

from __future__ import annotations

from typing import Any
from uuid import uuid4

from faker import Faker
from polyfactory import Use
from polyfactory.factories.sqlalchemy_factory import SQLAlchemyFactory
from sqlalchemy.orm import Session

from knowledge_chatbox_api.models.auth import AuthSession, User
from knowledge_chatbox_api.models.chat import (
    ChatMessage,
    ChatMessageAttachment,
    ChatRun,
    ChatRunEvent,
    ChatSession,
)
from knowledge_chatbox_api.models.document import Document, DocumentRevision
from knowledge_chatbox_api.models.settings import AppSettings
from knowledge_chatbox_api.models.space import Space

_fake = Faker()


def _random_int() -> int:
    return _fake.pyint()


def _random_positive_int() -> int:
    return _fake.pyint(min_value=1, max_value=99999)


class _PersistedFactoryMixin:
    @classmethod
    def persisted_create(cls, session: Session, **kwargs: Any) -> Any:
        instance = cls.build(**kwargs)
        session.add(instance)
        session.commit()
        session.refresh(instance)
        return instance

    @classmethod
    def persisted_batch(cls, session: Session, size: int, **kwargs: Any) -> list[Any]:
        instances = cls.batch(size, **kwargs)
        for instance in instances:
            session.add(instance)
        session.commit()
        for instance in instances:
            session.refresh(instance)
        return instances


class UserFactory(SQLAlchemyFactory[User], _PersistedFactoryMixin):
    __model__ = User

    username = Use(_fake.user_name)
    password_hash = "hash"
    role = "user"
    status = "active"
    theme_preference = "system"
    created_by_user_id = None


class AuthSessionFactory(SQLAlchemyFactory[AuthSession], _PersistedFactoryMixin):
    __model__ = AuthSession

    user_id = Use(_random_int)
    session_token_hash = Use(lambda: uuid4().hex)
    expires_at = Use(lambda: _fake.future_datetime(end_date="+30d"))
    last_seen_at = None
    revoked_at = None


class SpaceFactory(SQLAlchemyFactory[Space], _PersistedFactoryMixin):
    __model__ = Space

    owner_user_id = Use(_random_int)
    slug = Use(lambda: f"space-{uuid4().hex[:8]}")
    name = Use(lambda: f"Space {_fake.word()}")
    kind = "personal"

    @classmethod
    def _create_model_instance(cls, **kwargs: Any) -> Space:
        _skip = ("created_by_user_id", "updated_by_user_id")
        return super()._create_model_instance(
            created_by_user_id=kwargs.get("owner_user_id"),
            updated_by_user_id=kwargs.get("owner_user_id"),
            **{k: v for k, v in kwargs.items() if k not in _skip},
        )


class ChatSessionFactory(SQLAlchemyFactory[ChatSession], _PersistedFactoryMixin):
    __model__ = ChatSession

    space_id = Use(_random_int)
    user_id = Use(_random_int)
    title = Use(lambda: f"Session {_fake.sentence(nb_words=3)}")
    status = "active"
    reasoning_mode = "default"


class ChatMessageFactory(SQLAlchemyFactory[ChatMessage], _PersistedFactoryMixin):
    __model__ = ChatMessage

    session_id = Use(_random_int)
    role = "user"
    content = Use(lambda: _fake.paragraph(nb_sentences=2))
    status = "succeeded"
    error_message = None
    retry_of_message_id = None
    reply_to_message_id = None
    sources_json = None

    @classmethod
    def _create_model_instance(cls, **kwargs: Any) -> ChatMessage:
        role = kwargs.get("role", "user")
        if role in ("assistant", "system"):
            kwargs["client_request_id"] = None
        else:
            kwargs.setdefault("client_request_id", uuid4().hex[:24])
        return super()._create_model_instance(**kwargs)


class ChatMessageAttachmentFactory(
    SQLAlchemyFactory[ChatMessageAttachment], _PersistedFactoryMixin
):
    __model__ = ChatMessageAttachment

    message_id = Use(_random_int)
    attachment_id = Use(lambda: f"att-{uuid4().hex[:12]}")
    type = "document"
    name = Use(lambda: f"{_fake.file_name(extension='md')}")
    mime_type = "text/markdown; charset=utf-8"
    size_bytes = Use(_random_positive_int)
    document_revision_id = None
    archived_at = None


class ChatRunFactory(SQLAlchemyFactory[ChatRun], _PersistedFactoryMixin):
    __model__ = ChatRun

    session_id = Use(_random_int)
    parent_run_id = None
    user_message_id = None
    assistant_message_id = None
    status = "succeeded"
    response_provider = "openai"
    response_model = "gpt-5.4"
    reasoning_mode = "default"
    client_request_id = Use(lambda: uuid4().hex[:24])
    usage_json = None
    error_code = None
    error_message = None
    started_at = Use(lambda: _fake.past_datetime(start_date="-1h"))
    finished_at = Use(lambda: _fake.past_datetime(start_date="-10m"))


class ChatRunEventFactory(SQLAlchemyFactory[ChatRunEvent], _PersistedFactoryMixin):
    __model__ = ChatRunEvent

    run_id = Use(_random_int)
    seq = Use(_random_positive_int)
    event_type = "chunk_delta"
    payload_json = Use(dict)


class DocumentFactory(SQLAlchemyFactory[Document], _PersistedFactoryMixin):
    __model__ = Document

    space_id = Use(_random_int)
    title = Use(lambda: f"{_fake.file_name(extension='md')}")
    logical_name = Use(lambda: f"{_fake.file_name(extension='md')}")
    status = "active"
    current_version_number = 1
    latest_revision_id = None
    created_by_user_id = Use(_random_int)
    updated_by_user_id = Use(_random_int)


class DocumentRevisionFactory(SQLAlchemyFactory[DocumentRevision], _PersistedFactoryMixin):
    __model__ = DocumentRevision

    document_id = Use(_random_int)
    revision_no = 1
    source_filename = Use(lambda: _fake.file_name(extension="md"))
    content_hash = Use(_fake.sha256)
    file_type = "md"
    ingest_status = "indexed"
    source_path = Use(lambda: f"/uploads/{_fake.file_name()}")
    normalized_path = Use(lambda: f"/normalized/{_fake.file_name()}")
    file_size = Use(_random_positive_int)
    chunk_count = None
    error_message = None
    supersedes_revision_id = None
    indexed_at = Use(lambda: _fake.past_datetime())
    created_by_user_id = Use(_random_int)
    updated_by_user_id = Use(_random_int)

    @classmethod
    def _create_model_instance(cls, **kwargs: Any) -> DocumentRevision:
        file_type = kwargs.get("file_type", "md")
        from knowledge_chatbox_api.utils.document_types import guess_mime_type

        kwargs["mime_type"] = guess_mime_type(file_type)
        return super()._create_model_instance(**kwargs)


class AppSettingsFactory(SQLAlchemyFactory[AppSettings], _PersistedFactoryMixin):
    __model__ = AppSettings

    scope_type = "global"
    scope_id = "global"
    provider_profiles_json = {
        "openai": {"api_key": None, "base_url": "https://api.openai.com/v1"},
        "anthropic": {"api_key": None, "base_url": "https://api.anthropic.com"},
        "voyage": {"api_key": None, "base_url": "https://api.voyageai.com/v1"},
        "ollama": {"base_url": "http://host.docker.internal:11434"},
    }
    response_route_json = {"provider": "openai", "model": "gpt-5.4"}
    embedding_route_json = {"provider": "openai", "model": "text-embedding-3-small"}
    pending_embedding_route_json = None
    vision_route_json = {"provider": "openai", "model": "gpt-5.4"}
    system_prompt = None
    provider_timeout_seconds = 60
    active_index_generation = 1
    building_index_generation = None
    index_rebuild_status = "idle"
