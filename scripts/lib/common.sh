#!/usr/bin/env bash

if [[ "${KNOWLEDGE_CHATBOX_SHELL_COMMON_LOADED:-0}" == "1" ]]; then
  if [[ "${BASH_SOURCE[0]}" != "$0" ]]; then
    return 0
  fi
  exit 0
fi
KNOWLEDGE_CHATBOX_SHELL_COMMON_LOADED=1

COMMON_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
SCRIPTS_DIR="$(cd -- "${COMMON_DIR}/.." && pwd)"
# shellcheck disable=SC2034
REPO_ROOT="$(cd -- "${SCRIPTS_DIR}/.." && pwd)"

: "${SCRIPT_LABEL:=script}"

log() {
  printf '[%s] %s\n' "$SCRIPT_LABEL" "$*"
}

die() {
  printf '[%s] %s\n' "$SCRIPT_LABEL" "$*" >&2
  exit 1
}

require_command() {
  command -v "$1" >/dev/null 2>&1 || die "缺少命令：$1"
}

normalize_fs_path() {
  local path="$1"

  require_command python3
  python3 - "$path" <<'PY'
from __future__ import annotations

import os
import sys
from pathlib import Path

print(Path(os.path.expanduser(sys.argv[1])).resolve(strict=False))
PY
}

resolve_fs_path() {
  local base_dir="$1"
  local input="$2"
  local candidate

  case "$input" in
  "") die "路径不能为空" ;;
  /*) candidate="$input" ;;
  ~ | ~/*) candidate="$input" ;;
  *) candidate="${base_dir}/${input}" ;;
  esac

  normalize_fs_path "$candidate"
}

path_contains_path() {
  local candidate="$1"
  local target="$2"

  require_command python3
  python3 - "$candidate" "$target" <<'PY'
from __future__ import annotations

import os
import sys
from pathlib import Path

candidate = Path(os.path.expanduser(sys.argv[1])).resolve(strict=False)
target = Path(os.path.expanduser(sys.argv[2])).resolve(strict=False)

try:
    target.relative_to(candidate)
except ValueError:
    raise SystemExit(1)
PY
}

ensure_not_ancestor_of() {
  local candidate="$1"
  local label="$2"
  local anchor="$3"
  local anchor_label="$4"

  if path_contains_path "$candidate" "$anchor"; then
    die "$label 目标过于宽泛，不能覆盖${anchor_label}：$candidate"
  fi
}

trim() {
  local value="$1"
  value="${value#"${value%%[![:space:]]*}"}"
  value="${value%"${value##*[![:space:]]}"}"
  printf '%s' "$value"
}

strip_quotes() {
  local value="$1"

  if [[ "$value" == \"*\" && "$value" == *\" ]]; then
    printf '%s' "${value:1:${#value}-2}"
    return
  fi

  if [[ "$value" == \'*\' && "$value" == *\' ]]; then
    printf '%s' "${value:1:${#value}-2}"
    return
  fi

  printf '%s' "$value"
}
