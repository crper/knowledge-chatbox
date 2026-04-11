from __future__ import annotations

import os
import subprocess
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[4]
RESET_SCRIPT = REPO_ROOT / "scripts" / "reset-local-data.sh"


def test_reset_local_data_removes_sqlite_wal_sidecars(tmp_path: Path) -> None:
    upload_dir = tmp_path / "uploads"
    normalized_dir = tmp_path / "normalized"
    chroma_dir = tmp_path / "chroma"
    sqlite_dir = tmp_path / "sqlite"
    sqlite_path = sqlite_dir / "ai_qa.db"
    sqlite_wal_path = sqlite_dir / "ai_qa.db-wal"
    sqlite_shm_path = sqlite_dir / "ai_qa.db-shm"
    env_file = tmp_path / ".env.reset-test"

    upload_dir.mkdir(parents=True)
    normalized_dir.mkdir(parents=True)
    chroma_dir.mkdir(parents=True)
    sqlite_dir.mkdir(parents=True)

    (upload_dir / "temp.txt").write_text("upload", encoding="utf-8")
    (normalized_dir / "temp.md").write_text("normalized", encoding="utf-8")
    (chroma_dir / "temp.bin").write_text("index", encoding="utf-8")
    sqlite_path.write_text("db", encoding="utf-8")
    sqlite_wal_path.write_text("wal", encoding="utf-8")
    sqlite_shm_path.write_text("shm", encoding="utf-8")

    env_file.write_text(
        "\n".join(
            [
                f"UPLOAD_DIR={upload_dir}",
                f"NORMALIZED_DIR={normalized_dir}",
                f"CHROMA_PATH={chroma_dir}",
                f"SQLITE_PATH={sqlite_path}",
            ]
        )
        + "\n",
        encoding="utf-8",
    )

    result = subprocess.run(
        [
            str(RESET_SCRIPT),
            "--yes",
            "--skip-migrate",
        ],
        check=False,
        cwd=REPO_ROOT,
        env={
            **os.environ,
            "ENV_FILE": str(env_file),
        },
        text=True,
        capture_output=True,
    )

    assert result.returncode == 0, result.stderr or result.stdout
    assert list(upload_dir.iterdir()) == []
    assert list(normalized_dir.iterdir()) == []
    assert list(chroma_dir.iterdir()) == []
    assert not sqlite_path.exists()
    assert not sqlite_wal_path.exists()
    assert not sqlite_shm_path.exists()


def test_reset_local_data_rejects_targets_that_escape_repo_root(tmp_path: Path) -> None:
    normalized_dir = tmp_path / "normalized"
    chroma_dir = tmp_path / "chroma"
    sqlite_path = tmp_path / "sqlite" / "ai_qa.db"
    env_file = tmp_path / ".env.reset-test"

    env_file.write_text(
        "\n".join(
            [
                "UPLOAD_DIR=./..",
                f"NORMALIZED_DIR={normalized_dir}",
                f"CHROMA_PATH={chroma_dir}",
                f"SQLITE_PATH={sqlite_path}",
            ]
        )
        + "\n",
        encoding="utf-8",
    )

    result = subprocess.run(
        [
            str(RESET_SCRIPT),
            "--yes",
            "--skip-migrate",
        ],
        check=False,
        cwd=REPO_ROOT,
        env={
            **os.environ,
            "ENV_FILE": str(env_file),
        },
        text=True,
        capture_output=True,
    )

    assert result.returncode != 0
    assert "不能覆盖仓库根" in (result.stderr or result.stdout)
