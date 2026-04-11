from __future__ import annotations

from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[4]


def _is_relevant_shell_script(path: Path) -> bool:
    excluded = {".git", "node_modules", ".venv"}
    return not excluded.intersection(path.parts)


def test_all_shell_scripts_live_under_scripts_directory() -> None:
    shell_scripts = sorted(
        path.relative_to(REPO_ROOT).as_posix()
        for path in REPO_ROOT.rglob("*.sh")
        if _is_relevant_shell_script(path)
    )

    assert shell_scripts
    assert all(path.startswith("scripts/") for path in shell_scripts), shell_scripts
