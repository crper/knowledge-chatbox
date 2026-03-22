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
from knowledge_chatbox_api.main import create_app
from knowledge_chatbox_api.utils.chroma import reset_chroma_store

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
