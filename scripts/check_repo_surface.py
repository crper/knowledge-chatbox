from __future__ import annotations

import re
import sys
from pathlib import Path


REPO_ROOT = Path(__file__).resolve().parents[1]
OFFICIAL_SEQUENCE = ["just init-env", "just setup", "just dev"]
ROOT_DOCS = [
    REPO_ROOT / "README.md",
    REPO_ROOT / "CONTRIBUTING.md",
]
PACKAGE_DOCS = [
    REPO_ROOT / "apps" / "web" / "README.md",
    REPO_ROOT / "apps" / "api" / "README.md",
]
CODE_BLOCK_PATTERN = re.compile(r"```(?:bash|sh|shell)\n(.*?)```", re.DOTALL)
JUST_COMMAND_PATTERN = re.compile(r"(?:^|\s)just\s+([A-Za-z][\w-]*)")
PACKAGE_MANAGER_PATTERN = re.compile(r"^\s*(?:pnpm|npm|yarn)\b")


def parse_just_commands(content: str) -> set[str]:
    commands: set[str] = set()

    for raw_line in content.splitlines():
        line = raw_line.strip()
        alias_match = re.match(r"alias\s+([A-Za-z][\w-]*)\s*:=", line)
        if alias_match:
            commands.add(alias_match.group(1))
            continue

        if ":=" in line or ":" not in line:
            continue

        recipe_prefix = line.split(":", 1)[0].strip()
        if not recipe_prefix:
            continue

        recipe_name = recipe_prefix.split()[0]
        if re.fullmatch(r"[A-Za-z][\w-]*", recipe_name):
            commands.add(recipe_name)

    return commands


def extract_shell_commands(content: str) -> list[str]:
    commands: list[str] = []

    for block in CODE_BLOCK_PATTERN.findall(content):
        for raw_line in block.splitlines():
            line = raw_line.strip()
            if not line or line.startswith("#"):
                continue
            commands.append(line)

    return commands


def contains_official_sequence(content: str) -> bool:
    for block in CODE_BLOCK_PATTERN.findall(content):
        lines = [line.strip() for line in block.splitlines() if line.strip() and not line.strip().startswith("#")]
        sequence_index = 0

        for line in lines:
            if sequence_index < len(OFFICIAL_SEQUENCE) and line == OFFICIAL_SEQUENCE[sequence_index]:
                sequence_index += 1

        if sequence_index == len(OFFICIAL_SEQUENCE):
            return True

    return False


def format_path_label(path: Path) -> str:
    if path.is_absolute() and path.is_relative_to(REPO_ROOT):
        return path.relative_to(REPO_ROOT).as_posix()

    parts = path.parts
    if "apps" in parts:
        apps_index = parts.index("apps")
        return Path(*parts[apps_index:]).as_posix()

    return path.name


def validate_markdown_file(
    *,
    path: Path,
    just_commands: set[str],
    require_official_sequence: bool,
    require_root_reference: bool,
) -> list[str]:
    content = path.read_text(encoding="utf-8")
    relative_label = format_path_label(path)
    errors: list[str] = []

    if require_root_reference and "../../README.md" not in content:
        errors.append(f"{relative_label}: 缺少回指根 README 的链接 `../../README.md`。")

    if require_official_sequence and not contains_official_sequence(content):
        errors.append(
            f"{relative_label}: 缺少唯一官方开发主线代码块，应包含 `just init-env -> just setup -> just dev`。"
        )

    for command in extract_shell_commands(content):
        if PACKAGE_MANAGER_PATTERN.match(command):
            errors.append(f"{relative_label}: 不应在 shell 示例里把 `pnpm`、`npm` 或 `yarn` 当成官方入口。")
            continue

        for match in JUST_COMMAND_PATTERN.finditer(command):
            just_command = match.group(1)
            if just_command not in just_commands:
                errors.append(f"{relative_label}: 引用了 justfile 中不存在的命令 `{just_command}`。")

    return errors


def main() -> int:
    justfile_path = REPO_ROOT / "justfile"
    just_commands = parse_just_commands(justfile_path.read_text(encoding="utf-8"))
    errors: list[str] = []

    for markdown_path in ROOT_DOCS:
        errors.extend(
            validate_markdown_file(
                path=markdown_path,
                just_commands=just_commands,
                require_official_sequence=True,
                require_root_reference=False,
            )
        )

    for markdown_path in PACKAGE_DOCS:
        errors.extend(
            validate_markdown_file(
                path=markdown_path,
                just_commands=just_commands,
                require_official_sequence=False,
                require_root_reference=True,
            )
        )

    if errors:
        for error in errors:
            print(error, file=sys.stderr)
        return 1

    print("repo surface check passed")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
