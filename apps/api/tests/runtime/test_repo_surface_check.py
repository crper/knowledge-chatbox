from __future__ import annotations

import importlib.util
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[4]
MODULE_PATH = REPO_ROOT / "scripts" / "check_repo_surface.py"
SPEC = importlib.util.spec_from_file_location("check_repo_surface", MODULE_PATH)
assert SPEC and SPEC.loader
MODULE = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(MODULE)


def write_markdown(path: Path, body: str) -> None:
    path.write_text(body.strip() + "\n", encoding="utf-8")


def test_collects_just_recipes_and_aliases() -> None:
    recipes = MODULE.parse_just_commands(
        """
set shell := ["bash", "-cu"]
alias d := dev
alias dc := docker-up

help:
    @just --list

dev:
    scripts/dev-run.sh

docker-up:
    scripts/docker-deploy.sh up

docker-logs service='':
    scripts/docker-deploy.sh logs
"""
    )

    assert {"help", "dev", "docker-up", "docker-logs", "d", "dc"} <= recipes


def test_extracts_shell_commands_from_bash_blocks(tmp_path: Path) -> None:
    readme = tmp_path / "README.md"
    write_markdown(
        readme,
        """
        # Example

        ```bash
        just init-env
        API_PORT=18080 WEB_PORT=13000 just dev
        ```
        """,
    )

    commands = MODULE.extract_shell_commands(readme.read_text(encoding="utf-8"))

    assert commands == ["just init-env", "API_PORT=18080 WEB_PORT=13000 just dev"]


def test_requires_official_root_sequence_for_root_docs(tmp_path: Path) -> None:
    readme = tmp_path / "README.md"
    write_markdown(
        readme,
        """
        # Example

        ```bash
        just setup
        just dev
        ```
        """,
    )

    errors = MODULE.validate_markdown_file(
        path=readme,
        just_commands={"init-env", "setup", "dev"},
        require_official_sequence=True,
        require_root_reference=False,
    )

    assert errors == [
        "README.md: 缺少唯一官方开发主线代码块，应包含 `just init-env -> just setup -> just dev`。"
    ]


def test_requires_package_docs_to_point_back_to_root_and_avoid_package_manager_commands(
    tmp_path: Path,
) -> None:
    package_readme = tmp_path / "apps" / "web" / "README.md"
    package_readme.parent.mkdir(parents=True)
    write_markdown(
        package_readme,
        """
        # Web

        ```bash
        pnpm dev
        ```
        """,
    )

    errors = MODULE.validate_markdown_file(
        path=package_readme,
        just_commands={"init-env", "setup", "dev"},
        require_official_sequence=False,
        require_root_reference=True,
    )

    assert errors == [
        "apps/web/README.md: 缺少回指根 README 的链接 `../../README.md`。",
        "apps/web/README.md: 不应在 shell 示例里把 `pnpm`、`npm` 或 `yarn` 当成官方入口。",
    ]


def test_allows_package_docs_to_only_reference_root_onboarding(tmp_path: Path) -> None:
    package_readme = tmp_path / "apps" / "api" / "README.md"
    package_readme.parent.mkdir(parents=True)
    write_markdown(
        package_readme,
        """
        # API

        接手这个包前，先看 [README.md](../../README.md)。

        ```bash
        cd apps/api
        uv run --group dev python -m pytest
        ```
        """,
    )

    errors = MODULE.validate_markdown_file(
        path=package_readme,
        just_commands={"init-env", "setup", "dev"},
        require_official_sequence=False,
        require_root_reference=True,
    )

    assert errors == []


def test_flags_unknown_just_commands(tmp_path: Path) -> None:
    readme = tmp_path / "README.md"
    write_markdown(
        readme,
        """
        # Example

        ```bash
        just init-env
        just setup
        just launch
        ```
        """,
    )

    errors = MODULE.validate_markdown_file(
        path=readme,
        just_commands={"init-env", "setup", "dev"},
        require_official_sequence=False,
        require_root_reference=False,
    )

    assert errors == ["README.md: 引用了 justfile 中不存在的命令 `launch`。"]
