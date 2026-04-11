from __future__ import annotations

from typing import TYPE_CHECKING

from knowledge_chatbox_api.core.config import get_settings
from knowledge_chatbox_api.db.session import create_db_engine

if TYPE_CHECKING:
    from pathlib import Path

    import pytest


def test_sqlite_engine_enables_wal_and_busy_timeout(
    clear_settings_cache,
    monkeypatch: pytest.MonkeyPatch,
    tmp_path: Path,
) -> None:
    del clear_settings_cache
    sqlite_path = tmp_path / "streaming-resilience.db"
    monkeypatch.setenv("SQLITE_PATH", str(sqlite_path))
    get_settings.cache_clear()

    engine = create_db_engine()

    try:
        with engine.connect() as connection:
            journal_mode = connection.exec_driver_sql("PRAGMA journal_mode").scalar_one()
            busy_timeout = connection.exec_driver_sql("PRAGMA busy_timeout").scalar_one()
            foreign_keys = connection.exec_driver_sql("PRAGMA foreign_keys").scalar_one()
    finally:
        engine.dispose()

    assert str(journal_mode).lower() == "wal"
    assert int(busy_timeout) >= 30000
    assert int(foreign_keys) == 1
