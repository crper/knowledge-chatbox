from __future__ import annotations

from collections.abc import Iterator, Mapping
from contextlib import contextmanager
from pathlib import Path

import pytest
from alembic import command
from alembic.config import Config
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, event, text
from sqlalchemy.orm import Session, sessionmaker

from knowledge_chatbox_api.api.deps import _build_rate_limit_service
from knowledge_chatbox_api.core.config import get_settings
from knowledge_chatbox_api.db.session import create_session_factory
from knowledge_chatbox_api.main import create_app
from knowledge_chatbox_api.services.settings.settings_service import SettingsService
from knowledge_chatbox_api.utils.chroma import reset_chroma_store
from tests.fixtures.stubs import EmbeddingAdapterStub, ResponseAdapterStub

ALEMBIC_CONFIG_PATH = Path(__file__).resolve().parents[1] / "alembic.ini"
DEFAULT_ADMIN_ENV = {
    "INITIAL_ADMIN_USERNAME": "admin",
    "INITIAL_ADMIN_PASSWORD": "admin123456",
}


@pytest.fixture(autouse=True)
def clear_settings_cache() -> None:
    get_settings.cache_clear()
    _build_rate_limit_service.cache_clear()
    yield
    get_settings.cache_clear()
    _build_rate_limit_service.cache_clear()


def _prepare_test_runtime(
    monkeypatch: pytest.MonkeyPatch,
    sqlite_path: Path,
    chroma_path: Path,
    *,
    env_overrides: Mapping[str, str] | None = None,
) -> None:
    monkeypatch.delenv("SESSION_COOKIE_SECURE", raising=False)
    monkeypatch.setenv("SQLITE_PATH", str(sqlite_path))
    monkeypatch.setenv("CHROMA_PATH", str(chroma_path))
    for key, value in (env_overrides or {}).items():
        monkeypatch.setenv(key, value)
    get_settings.cache_clear()
    reset_chroma_store(clear_persisted=True, storage_path=chroma_path)


def _upgrade_test_db() -> None:
    config = Config(str(ALEMBIC_CONFIG_PATH))
    command.upgrade(config, "head")


@contextmanager
def _test_client(
    monkeypatch: pytest.MonkeyPatch,
    sqlite_path: Path,
    chroma_path: Path,
    *,
    env_overrides: Mapping[str, str] | None = None,
    base_url: str = "http://testserver",
) -> Iterator[TestClient]:
    _prepare_test_runtime(
        monkeypatch,
        sqlite_path,
        chroma_path,
        env_overrides=env_overrides,
    )
    _upgrade_test_db()
    app = create_app()
    with TestClient(app, base_url=base_url) as test_client:
        yield test_client


@pytest.fixture()
def client(
    clear_settings_cache,
    monkeypatch: pytest.MonkeyPatch,
    sqlite_path: Path,
    chroma_path: Path,
) -> Iterator[TestClient]:
    with _test_client(monkeypatch, sqlite_path, chroma_path) as test_client:
        yield test_client


@pytest.fixture()
def temp_dir(tmp_path: Path) -> Path:
    return tmp_path


@pytest.fixture()
def sqlite_path(tmp_path: Path) -> Path:
    return tmp_path / "test.db"


@pytest.fixture()
def chroma_path(tmp_path: Path) -> Path:
    return tmp_path / "chroma"


@pytest.fixture()
def alembic_config(
    monkeypatch: pytest.MonkeyPatch,
    sqlite_path: Path,
    chroma_path: Path,
) -> Config:
    _prepare_test_runtime(monkeypatch, sqlite_path, chroma_path)
    return Config(str(ALEMBIC_CONFIG_PATH))


@pytest.fixture()
def migrated_db_session(alembic_config: Config, sqlite_path: Path) -> Session:
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


@pytest.fixture()
def api_client(
    clear_settings_cache,
    monkeypatch: pytest.MonkeyPatch,
    sqlite_path: Path,
    chroma_path: Path,
) -> Iterator[TestClient]:
    with _test_client(
        monkeypatch,
        sqlite_path,
        chroma_path,
        env_overrides=DEFAULT_ADMIN_ENV,
    ) as test_client:
        yield test_client


@pytest.fixture()
def api_client_https(
    clear_settings_cache,
    monkeypatch: pytest.MonkeyPatch,
    sqlite_path: Path,
    chroma_path: Path,
) -> Iterator[TestClient]:
    with _test_client(
        monkeypatch,
        sqlite_path,
        chroma_path,
        env_overrides=DEFAULT_ADMIN_ENV,
        base_url="https://testserver",
    ) as test_client:
        yield test_client


@pytest.fixture()
def api_client_https_cookie_insecure(
    clear_settings_cache,
    monkeypatch: pytest.MonkeyPatch,
    sqlite_path: Path,
    chroma_path: Path,
) -> Iterator[TestClient]:
    with _test_client(
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


@pytest.fixture()
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
def stub_response_adapter():
    """提供响应适配器 Stub"""
    return ResponseAdapterStub()


@pytest.fixture
def stub_embedding_adapter():
    """提供嵌入适配器 Stub"""
    return EmbeddingAdapterStub()


@pytest.fixture
def mock_chat_adapters(monkeypatch, stub_response_adapter, stub_embedding_adapter):
    """自动 mock chat 相关的 adapter"""
    monkeypatch.setattr(
        "knowledge_chatbox_api.services.chat.chat_application_service.build_response_adapter_from_settings",
        lambda settings_record: stub_response_adapter,
    )
    monkeypatch.setattr(
        "knowledge_chatbox_api.services.chat.chat_application_service.build_embedding_adapter_from_settings",
        lambda settings_record: stub_embedding_adapter,
    )


@pytest.fixture
def logged_in_admin(api_client: TestClient) -> dict:
    """登录管理员并返回认证信息"""
    response = api_client.post(
        "/api/auth/login",
        json={"username": "admin", "password": "admin123456"},
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
