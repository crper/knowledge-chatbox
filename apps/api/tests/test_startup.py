import sqlite3
from pathlib import Path

import pytest
from alembic import command
from alembic.config import Config
from fastapi.testclient import TestClient
from sqlalchemy import select
from sqlalchemy.exc import OperationalError

from knowledge_chatbox_api.core.config import get_settings
from knowledge_chatbox_api.db.session import create_session_factory
from knowledge_chatbox_api.main import _raise_if_database_schema_incompatible, create_app
from knowledge_chatbox_api.models.auth import User
from knowledge_chatbox_api.models.chat import ChatMessage, ChatRun, ChatSession
from knowledge_chatbox_api.models.space import Space
from knowledge_chatbox_api.repositories.space_repository import SpaceRepository
from knowledge_chatbox_api.services.chat.chat_run_service import STREAM_INTERRUPTED_ERROR_MESSAGE
from knowledge_chatbox_api.services.settings.settings_service import (
    INDEX_REBUILD_STATUS_RUNNING,
    SettingsService,
)


def test_startup_requires_database_migration(
    clear_settings_cache,
    monkeypatch: pytest.MonkeyPatch,
    tmp_path: Path,
) -> None:
    del clear_settings_cache
    monkeypatch.setenv("SQLITE_PATH", str(tmp_path / "empty.db"))

    app = create_app()

    with pytest.raises(RuntimeError, match=r"uv run python -m alembic upgrade head"):
        with TestClient(app):
            pass


def test_schema_guard_raises_clear_error_for_missing_column() -> None:
    error = OperationalError(
        "SELECT ...",
        {},
        sqlite3.OperationalError("no such column: app_settings.provider_timeout_seconds"),
    )

    with pytest.raises(RuntimeError, match="检测到旧 schema/旧迁移历史"):
        _raise_if_database_schema_incompatible(error)


def test_startup_compensates_running_index_rebuild(
    clear_settings_cache,
    monkeypatch: pytest.MonkeyPatch,
    tmp_path: Path,
) -> None:
    del clear_settings_cache
    sqlite_path = tmp_path / "app.db"
    monkeypatch.setenv("SQLITE_PATH", str(sqlite_path))
    get_settings.cache_clear()

    config = Config(str(Path(__file__).resolve().parents[1] / "alembic.ini"))
    command.upgrade(config, "head")

    settings = get_settings()
    session_factory = create_session_factory()
    with session_factory() as session:
        service = SettingsService(session, settings)
        settings_record = service.get_or_create_settings_record()
        active_generation = settings_record.active_index_generation
        settings_record.index_rebuild_status = INDEX_REBUILD_STATUS_RUNNING
        settings_record.building_index_generation = active_generation + 1
        session.commit()

    app = create_app()

    with TestClient(app):
        pass

    with session_factory() as session:
        reloaded = SettingsService(session, settings).get_or_create_settings_record()
        assert reloaded.index_rebuild_status == "failed"
        assert reloaded.active_index_generation == active_generation
        assert reloaded.building_index_generation == active_generation + 1


def test_startup_rejects_legacy_schema_instead_of_migrating_it(
    clear_settings_cache,
    monkeypatch: pytest.MonkeyPatch,
    tmp_path: Path,
) -> None:
    del clear_settings_cache
    sqlite_path = tmp_path / "legacy.db"
    monkeypatch.setenv("SQLITE_PATH", str(sqlite_path))
    get_settings.cache_clear()

    with sqlite3.connect(sqlite_path) as connection:
        connection.execute("CREATE TABLE alembic_version (version_num VARCHAR(32) NOT NULL)")
        connection.execute(
            "INSERT INTO alembic_version (version_num) VALUES ('0001_initial_schema')"
        )
        connection.execute(
            """
            CREATE TABLE app_settings (
                id INTEGER NOT NULL PRIMARY KEY,
                provider_profiles_json TEXT
            )
            """
        )
        connection.commit()

    app = create_app()
    with pytest.raises(RuntimeError, match="检测到旧 schema/旧迁移历史"):
        with TestClient(app):
            pass


def test_startup_creates_personal_space_for_admin(
    clear_settings_cache,
    monkeypatch: pytest.MonkeyPatch,
    tmp_path: Path,
) -> None:
    del clear_settings_cache
    sqlite_path = tmp_path / "app.db"
    monkeypatch.setenv("SQLITE_PATH", str(sqlite_path))
    monkeypatch.setenv("INITIAL_ADMIN_USERNAME", "admin")
    monkeypatch.setenv("INITIAL_ADMIN_PASSWORD", "admin123456")
    get_settings.cache_clear()

    config = Config(str(Path(__file__).resolve().parents[1] / "alembic.ini"))
    command.upgrade(config, "head")

    app = create_app()
    with TestClient(app):
        pass

    session_factory = create_session_factory()
    with session_factory() as session:
        admin = session.scalar(select(User).where(User.username == "admin"))
        assert admin is not None
        space = SpaceRepository(session).get_personal_space(admin.id)

    assert isinstance(space, Space)
    assert space.owner_user_id == admin.id
    assert space.kind == "personal"


def test_startup_compensates_active_chat_runs(
    clear_settings_cache,
    monkeypatch: pytest.MonkeyPatch,
    tmp_path: Path,
) -> None:
    del clear_settings_cache
    sqlite_path = tmp_path / "app.db"
    monkeypatch.setenv("SQLITE_PATH", str(sqlite_path))
    get_settings.cache_clear()

    config = Config(str(Path(__file__).resolve().parents[1] / "alembic.ini"))
    command.upgrade(config, "head")

    session_factory = create_session_factory()
    with session_factory() as session:
        user = User(
            username="alice",
            password_hash="hash",
            role="user",
            status="active",
            theme_preference="system",
        )
        session.add(user)
        session.commit()
        session.refresh(user)

        space = SpaceRepository(session).ensure_personal_space(user_id=user.id)
        chat_session = ChatSession(space_id=space.id, user_id=user.id, title="session")
        session.add(chat_session)
        session.commit()
        session.refresh(chat_session)

        user_message = ChatMessage(
            session_id=chat_session.id,
            role="user",
            content="question",
            status="succeeded",
            client_request_id="req-startup-run-1",
        )
        session.add(user_message)
        session.commit()
        session.refresh(user_message)

        assistant_message = ChatMessage(
            session_id=chat_session.id,
            role="assistant",
            content="partial",
            status="streaming",
            reply_to_message_id=user_message.id,
        )
        session.add(assistant_message)
        session.commit()
        session.refresh(assistant_message)

        chat_run = ChatRun(
            session_id=chat_session.id,
            user_message_id=user_message.id,
            assistant_message_id=assistant_message.id,
            status="running",
            response_provider="openai",
            response_model="gpt-5.4",
            reasoning_mode="default",
            client_request_id="req-startup-run-1",
        )
        session.add(chat_run)
        session.commit()
        run_id = chat_run.id
        assistant_message_id = assistant_message.id

    app = create_app()
    with TestClient(app):
        pass

    with session_factory() as session:
        reloaded_run = session.get(ChatRun, run_id)
        reloaded_assistant = session.get(ChatMessage, assistant_message_id)

        assert reloaded_run is not None
        assert reloaded_run.status == "failed"
        assert reloaded_run.error_message == STREAM_INTERRUPTED_ERROR_MESSAGE
        assert reloaded_run.finished_at is not None

        assert reloaded_assistant is not None
        assert reloaded_assistant.status == "failed"
        assert reloaded_assistant.error_message == STREAM_INTERRUPTED_ERROR_MESSAGE
