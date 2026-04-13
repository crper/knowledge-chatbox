from __future__ import annotations

from tests.fixtures.runtime import (
    DEFAULT_ADMIN_ENV,
    TEST_ADMIN_PASSWORD,
    TEST_JWT_SECRET,
    build_test_runtime_env,
)


def test_build_test_runtime_env_sets_required_paths_and_secrets(tmp_path) -> None:
    sqlite_path = tmp_path / "test.db"
    chroma_path = tmp_path / "chroma"

    env = build_test_runtime_env(sqlite_path, chroma_path)

    assert env == {
        "CHROMA_PATH": str(chroma_path),
        "INITIAL_ADMIN_PASSWORD": TEST_ADMIN_PASSWORD,
        "JWT_SECRET_KEY": TEST_JWT_SECRET,
        "SQLITE_PATH": str(sqlite_path),
    }


def test_build_test_runtime_env_applies_explicit_overrides(tmp_path) -> None:
    sqlite_path = tmp_path / "test.db"
    chroma_path = tmp_path / "chroma"

    env = build_test_runtime_env(
        sqlite_path,
        chroma_path,
        env_overrides={
            **DEFAULT_ADMIN_ENV,
            "SESSION_COOKIE_SECURE": "false",
        },
    )

    assert env["INITIAL_ADMIN_USERNAME"] == DEFAULT_ADMIN_ENV["INITIAL_ADMIN_USERNAME"]
    assert env["INITIAL_ADMIN_PASSWORD"] == DEFAULT_ADMIN_ENV["INITIAL_ADMIN_PASSWORD"]
    assert env["JWT_SECRET_KEY"] == DEFAULT_ADMIN_ENV["JWT_SECRET_KEY"]
    assert env["SESSION_COOKIE_SECURE"] == "false"
