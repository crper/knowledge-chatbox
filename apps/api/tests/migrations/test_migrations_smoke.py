from __future__ import annotations

import sqlite3
from pathlib import Path

from alembic import command
from alembic.config import Config
from alembic.script import ScriptDirectory


def test_alembic_can_upgrade_and_downgrade_empty_database(
    monkeypatch,
    tmp_path: Path,
) -> None:
    sqlite_path = tmp_path / "test.db"

    monkeypatch.setenv("SQLITE_PATH", str(sqlite_path))

    config = Config(str(Path(__file__).resolve().parents[2] / "alembic.ini"))
    script = ScriptDirectory.from_config(config)

    command.upgrade(config, "head")

    with sqlite3.connect(sqlite_path) as connection:
        tables = {
            row[0]
            for row in connection.execute(
                "SELECT name FROM sqlite_master WHERE type='table'"
            ).fetchall()
        }
        app_settings_columns = {
            row[1] for row in connection.execute("PRAGMA table_info('app_settings')").fetchall()
        }
        version_rows_after_upgrade = connection.execute(
            "SELECT version_num FROM alembic_version"
        ).fetchall()

    assert {
        "spaces",
        "documents",
        "document_revisions",
        "app_settings",
        "settings_versions",
    } <= tables
    assert {
        "scope_type",
        "scope_id",
        "provider_profiles_json",
        "response_route_json",
        "embedding_route_json",
        "pending_embedding_route_json",
        "vision_route_json",
        "provider_timeout_seconds",
    } <= app_settings_columns
    settings_version_columns = {
        row[1] for row in connection.execute("PRAGMA table_info('settings_versions')").fetchall()
    }
    assert {
        "settings_id",
        "version_no",
        "snapshot_json",
        "changed_fields_json",
        "trigger",
    } <= settings_version_columns
    assert "provider_profiles" not in tables
    assert "capability_routes" not in tables
    assert version_rows_after_upgrade == [(script.get_current_head(),)]

    command.downgrade(config, "base")

    with sqlite3.connect(sqlite_path) as connection:
        tables_after_downgrade = {
            row[0]
            for row in connection.execute(
                "SELECT name FROM sqlite_master WHERE type='table'"
            ).fetchall()
        }

    assert "users" not in tables_after_downgrade


def test_alembic_creates_missing_sqlite_parent_directory(
    monkeypatch,
    tmp_path: Path,
) -> None:
    sqlite_path = tmp_path / "nested" / "sqlite" / "test.db"

    monkeypatch.setenv("SQLITE_PATH", str(sqlite_path))

    config = Config(str(Path(__file__).resolve().parents[2] / "alembic.ini"))

    command.upgrade(config, "head")

    assert sqlite_path.parent.exists() is True
    assert sqlite_path.exists() is True


def test_alembic_upgrade_works_when_cwd_is_not_apps_api(
    monkeypatch,
    tmp_path: Path,
) -> None:
    sqlite_path = tmp_path / "cwd-test" / "test.db"
    monkeypatch.setenv("SQLITE_PATH", str(sqlite_path))

    config = Config(str(Path(__file__).resolve().parents[2] / "alembic.ini"))
    monkeypatch.chdir(tmp_path)

    command.upgrade(config, "head")

    with sqlite3.connect(sqlite_path) as connection:
        tables = {
            row[0]
            for row in connection.execute(
                "SELECT name FROM sqlite_master WHERE type='table'"
            ).fetchall()
        }

    assert "users" in tables
