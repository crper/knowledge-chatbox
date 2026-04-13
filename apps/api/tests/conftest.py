from __future__ import annotations

import os
from pathlib import Path
from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from collections.abc import Generator

import pytest
from alembic import command
from alembic.config import Config
from sqlalchemy import create_engine, event, text
from sqlalchemy.orm import Session, sessionmaker

from knowledge_chatbox_api.core.config import get_settings
from knowledge_chatbox_api.db.session import create_session_factory
from knowledge_chatbox_api.services.settings.settings_service import SettingsService
from tests.fixtures.runtime import (
    DEFAULT_ADMIN_ENV,
    TEST_ADMIN_PASSWORD,
    TEST_JWT_SECRET,
    clear_test_runtime_caches,
    create_test_client,
    prepare_test_runtime,
)
from tests.fixtures.stubs import (
    EmbeddingAdapterStub,
    make_adapter_backed_chat_workflow_class,
)

if TYPE_CHECKING:
    from collections.abc import Iterator

    from fastapi.testclient import TestClient


@pytest.fixture(autouse=True)
def clear_settings_cache(monkeypatch: pytest.MonkeyPatch) -> Generator[None]:
    if not os.environ.get("JWT_SECRET_KEY"):
        monkeypatch.setenv("JWT_SECRET_KEY", TEST_JWT_SECRET)
    if not os.environ.get("INITIAL_ADMIN_PASSWORD"):
        monkeypatch.setenv("INITIAL_ADMIN_PASSWORD", TEST_ADMIN_PASSWORD)
    clear_test_runtime_caches()
    yield
    clear_test_runtime_caches()


@pytest.fixture
def client(
    clear_settings_cache,
    monkeypatch: pytest.MonkeyPatch,
    sqlite_path: Path,
    chroma_path: Path,
) -> Iterator[TestClient]:
    del clear_settings_cache
    with create_test_client(monkeypatch, sqlite_path, chroma_path) as test_client:
        yield test_client


@pytest.fixture
def temp_dir(tmp_path: Path) -> Path:
    return tmp_path


@pytest.fixture
def sqlite_path(tmp_path: Path) -> Path:
    return tmp_path / "test.db"


@pytest.fixture
def chroma_path(tmp_path: Path) -> Path:
    return tmp_path / "chroma"


@pytest.fixture
def alembic_config(
    monkeypatch: pytest.MonkeyPatch,
    sqlite_path: Path,
    chroma_path: Path,
) -> Config:
    prepare_test_runtime(monkeypatch, sqlite_path, chroma_path)
    return Config(str(Path(__file__).resolve().parents[1] / "alembic.ini"))


@pytest.fixture
def migrated_db_session(alembic_config: Config, sqlite_path: Path) -> Generator[Session]:
    command.upgrade(alembic_config, "head")

    engine = create_engine(f"sqlite:///{sqlite_path}")

    @event.listens_for(engine, "connect")
    def set_sqlite_pragma(dbapi_connection, connection_record) -> None:  # type: ignore[no-untyped-def]
        del connection_record
        cursor = dbapi_connection.cursor()
        cursor.execute("PRAGMA foreign_keys = ON")
        cursor.close()

    testing_session = sessionmaker(bind=engine, autoflush=False, autocommit=False, class_=Session)
    session = testing_session()
    session.execute(text("PRAGMA foreign_keys = ON"))

    try:
        yield session
    finally:
        session.close()
        engine.dispose()


@pytest.fixture
def api_client(
    clear_settings_cache,
    monkeypatch: pytest.MonkeyPatch,
    sqlite_path: Path,
    chroma_path: Path,
) -> Iterator[TestClient]:
    del clear_settings_cache
    with create_test_client(
        monkeypatch,
        sqlite_path,
        chroma_path,
        env_overrides=DEFAULT_ADMIN_ENV,
    ) as test_client:
        yield test_client


@pytest.fixture
def api_client_https(
    clear_settings_cache,
    monkeypatch: pytest.MonkeyPatch,
    sqlite_path: Path,
    chroma_path: Path,
) -> Iterator[TestClient]:
    del clear_settings_cache
    with create_test_client(
        monkeypatch,
        sqlite_path,
        chroma_path,
        env_overrides=DEFAULT_ADMIN_ENV,
        base_url="https://testserver",
    ) as test_client:
        yield test_client


@pytest.fixture
def api_client_https_cookie_insecure(
    clear_settings_cache,
    monkeypatch: pytest.MonkeyPatch,
    sqlite_path: Path,
    chroma_path: Path,
) -> Iterator[TestClient]:
    del clear_settings_cache
    with create_test_client(
        monkeypatch,
        sqlite_path,
        chroma_path,
        env_overrides={
            **DEFAULT_ADMIN_ENV,
            "SESSION_COOKIE_SECURE": "false",
        },
        base_url="https://testserver",
    ) as test_client:
        yield test_client


@pytest.fixture
def configure_upload_provider() -> None:
    session_factory = create_session_factory()
    with session_factory() as session:
        settings_record = SettingsService(session, get_settings()).get_or_create_settings_record()
        provider_profiles = settings_record.provider_profiles.model_dump()
        provider_profiles["openai"]["api_key"] = "test-openai-key"
        settings_record.provider_profiles_json = provider_profiles
        settings_record.pending_embedding_route_json = None
        settings_record.index_rebuild_status = "idle"
        settings_record.building_index_generation = None
        session.commit()


@pytest.fixture
def stub_embedding_adapter():
    """提供嵌入适配器 Stub"""
    return EmbeddingAdapterStub()


@pytest.fixture
def mock_pydanticai_chat_workflow(monkeypatch):
    chat_workflow_cls = make_adapter_backed_chat_workflow_class(
        sync_answer="workflow sync answer",
        sync_sources=[
            {
                "document_id": 7,
                "document_revision_id": 11,
                "document_name": "playbook.md",
                "chunk_id": "chunk-1",
                "snippet": "workflow source",
                "page_number": None,
                "section_title": "Intro",
                "score": 0.82,
            }
        ],
        stream_sources=[
            {
                "document_id": 7,
                "document_revision_id": 11,
                "document_name": "playbook.md",
                "chunk_id": "chunk-1",
                "snippet": "workflow source",
                "page_number": None,
                "section_title": "Intro",
                "score": 0.82,
            }
        ],
    )
    monkeypatch.setattr(
        "knowledge_chatbox_api.services.chat.chat_application_service.ChatWorkflow",
        chat_workflow_cls,
    )
    monkeypatch.setattr(
        "knowledge_chatbox_api.services.chat.chat_run_service.ChatWorkflow",
        chat_workflow_cls,
    )


@pytest.fixture
def logged_in_admin(api_client: TestClient) -> dict[str, object]:
    """登录管理员并返回认证信息"""
    response = api_client.post(
        "/api/auth/login",
        json={"username": "admin", "password": "Admin123456"},
    )
    assert response.status_code == 200
    return {
        "access_token": response.json()["data"]["access_token"],
        "cookies": response.cookies,
    }


@pytest.fixture
def auth_headers(logged_in_admin):
    """返回认证请求头"""
    return {"Authorization": f"Bearer {logged_in_admin['access_token']}"}
