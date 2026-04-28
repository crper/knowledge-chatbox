from __future__ import annotations

from contextlib import contextmanager
from pathlib import Path
from typing import TYPE_CHECKING

from alembic import command
from alembic.config import Config
from fastapi.testclient import TestClient

from knowledge_chatbox_api.core.config import get_settings
from knowledge_chatbox_api.db.session import reset_db_caches
from knowledge_chatbox_api.main import create_app
from knowledge_chatbox_api.utils.chroma import reset_chroma_store

if TYPE_CHECKING:
    from collections.abc import Iterator, Mapping

    import pytest

TEST_ADMIN_USERNAME = "admin"
TEST_ADMIN_PASSWORD = "Admin123456"
TEST_JWT_SECRET = "test-jwt-secret-key-for-unit-tests-32ch"
ALEMBIC_CONFIG_PATH = Path(__file__).resolve().parents[2] / "alembic.ini"
DEFAULT_ADMIN_ENV = {
    "INITIAL_ADMIN_USERNAME": TEST_ADMIN_USERNAME,
    "INITIAL_ADMIN_PASSWORD": TEST_ADMIN_PASSWORD,
    "JWT_SECRET_KEY": TEST_JWT_SECRET,
}


def clear_test_runtime_caches() -> None:
    """清理测试运行时共享缓存。"""
    reset_db_caches()
    get_settings.cache_clear()


def build_test_runtime_env(
    sqlite_path: Path,
    chroma_path: Path,
    *,
    env_overrides: Mapping[str, str] | None = None,
) -> dict[str, str]:
    """构造测试运行时环境变量集合。"""
    env = {
        "SQLITE_PATH": str(sqlite_path),
        "CHROMA_PATH": str(chroma_path),
        "JWT_SECRET_KEY": TEST_JWT_SECRET,
        "INITIAL_ADMIN_PASSWORD": TEST_ADMIN_PASSWORD,
    }
    env.update(env_overrides or {})
    return env


def prepare_test_runtime(
    monkeypatch: pytest.MonkeyPatch,
    sqlite_path: Path,
    chroma_path: Path,
    *,
    env_overrides: Mapping[str, str] | None = None,
) -> None:
    """准备 API 测试运行时环境。"""
    monkeypatch.delenv("SESSION_COOKIE_SECURE", raising=False)
    for key, value in build_test_runtime_env(
        sqlite_path,
        chroma_path,
        env_overrides=env_overrides,
    ).items():
        monkeypatch.setenv(key, value)
    clear_test_runtime_caches()
    reset_chroma_store(clear_persisted=True, storage_path=chroma_path)


def upgrade_test_db() -> None:
    """把测试数据库迁移到最新 schema。"""
    config = Config(str(ALEMBIC_CONFIG_PATH))
    command.upgrade(config, "head")


@contextmanager
def create_test_client(
    monkeypatch: pytest.MonkeyPatch,
    sqlite_path: Path,
    chroma_path: Path,
    *,
    env_overrides: Mapping[str, str] | None = None,
    base_url: str = "http://testserver",
) -> Iterator[TestClient]:
    """构造带完整测试运行时准备的 TestClient。"""
    prepare_test_runtime(
        monkeypatch,
        sqlite_path,
        chroma_path,
        env_overrides=env_overrides,
    )
    upgrade_test_db()
    app = create_app()
    try:
        with TestClient(app, base_url=base_url) as test_client:
            yield test_client
    finally:
        # 测试结束时清理 Chroma 缓存，释放文件句柄
        reset_chroma_store(clear_persisted=False, storage_path=chroma_path)
