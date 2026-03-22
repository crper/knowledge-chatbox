#!/usr/bin/env bash
set -Eeuo pipefail

ROOT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
ENV_FILE="${ENV_FILE:-${ROOT_DIR}/.env}"

AUTO_CONFIRM=false
SKIP_MIGRATE=false

log() {
  printf '[reset-local-data] %s\n' "$*"
}

die() {
  printf '[reset-local-data] %s\n' "$*" >&2
  exit 1
}

usage() {
  cat <<'EOF'
用法：
  reset-local-data.sh [--yes] [--skip-migrate]

选项：
  --yes           跳过交互确认
  --skip-migrate  清空数据后不执行 Alembic migration
  -h, --help      显示帮助

可选环境变量：
  ENV_FILE=/abs/path/.env

仓库根目录也提供等价入口：
  just reset-data
  just reset-dev
EOF
}

resolve_fs_path() {
  local input="$1"

  case "$input" in
    "") die "路径不能为空" ;;
    /*) printf '%s\n' "$input" ;;
    ~/*) printf '%s/%s\n' "$HOME" "${input#~/}" ;;
    ./*) printf '%s/%s\n' "$ROOT_DIR" "${input#./}" ;;
    *) printf '%s/%s\n' "$ROOT_DIR" "$input" ;;
  esac
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

load_env_file() {
  local line key value

  if [[ ! -f "$ENV_FILE" ]]; then
    log "未找到环境文件，使用默认路径：$ENV_FILE"
    return
  fi

  while IFS= read -r line || [[ -n "$line" ]]; do
    line="$(trim "$line")"
    [[ -z "$line" ]] && continue
    [[ "$line" == \#* ]] && continue

    key="${line%%=*}"
    value="${line#*=}"
    key="$(trim "${key#export }")"
    value="$(strip_quotes "$(trim "$value")")"

    case "$key" in
      DATA_DIR|UPLOAD_DIR|NORMALIZED_DIR|SQLITE_PATH|CHROMA_PATH)
        printf -v "$key" '%s' "$value"
        ;;
    esac
  done < "$ENV_FILE"
}

guard_safe_target() {
  local path="$1"
  local label="$2"

  [[ -n "$path" ]] || die "$label 不能为空"

  case "$path" in
    "/"|"$HOME"|"$ROOT_DIR")
      die "$label 目标过于宽泛，拒绝执行：$path"
      ;;
  esac
}

reset_directory() {
  local path="$1"
  local label="$2"

  guard_safe_target "$path" "$label"
  mkdir -p "$path"
  find "$path" -mindepth 1 -maxdepth 1 -exec rm -rf -- {} +
}

reset_file() {
  local path="$1"
  local label="$2"

  guard_safe_target "$path" "$label"
  mkdir -p "$(dirname "$path")"
  rm -f -- "$path"
}

require_command() {
  command -v "$1" >/dev/null 2>&1 || die "缺少命令：$1"
}

confirm_destructive_action() {
  if $AUTO_CONFIRM; then
    return
  fi

  if [[ ! -t 0 ]]; then
    die "当前为非交互环境。请显式传入 --yes 后再执行。"
  fi

  printf '即将删除以下本地数据：\n'
  printf '  uploads:    %s\n' "$UPLOAD_DIR_PATH"
  printf '  normalized: %s\n' "$NORMALIZED_DIR_PATH"
  printf '  chroma:     %s\n' "$CHROMA_PATH_PATH"
  printf '  sqlite:     %s\n' "$SQLITE_PATH_PATH"
  printf '输入 yes 继续：'

  local answer
  read -r answer
  [[ "$answer" == "yes" ]] || die "已取消"
}

run_migration() {
  require_command uv
  (
    cd "$ROOT_DIR/apps/api"
    uv run python -m alembic upgrade head
  )
}

parse_args() {
  while (($# > 0)); do
    case "$1" in
      --yes)
        AUTO_CONFIRM=true
        ;;
      --skip-migrate)
        SKIP_MIGRATE=true
        ;;
      -h|--help)
        usage
        exit 0
        ;;
      *)
        die "未知参数：$1"
        ;;
    esac
    shift
  done
}

parse_args "$@"
ENV_FILE="$(resolve_fs_path "$ENV_FILE")"
load_env_file

DATA_DIR="${DATA_DIR:-./data}"
UPLOAD_DIR="${UPLOAD_DIR:-${DATA_DIR}/uploads}"
NORMALIZED_DIR="${NORMALIZED_DIR:-${DATA_DIR}/normalized}"
SQLITE_PATH="${SQLITE_PATH:-${DATA_DIR}/sqlite/ai_qa.db}"
CHROMA_PATH="${CHROMA_PATH:-${DATA_DIR}/chroma}"

UPLOAD_DIR_PATH="$(resolve_fs_path "$UPLOAD_DIR")"
NORMALIZED_DIR_PATH="$(resolve_fs_path "$NORMALIZED_DIR")"
SQLITE_PATH_PATH="$(resolve_fs_path "$SQLITE_PATH")"
CHROMA_PATH_PATH="$(resolve_fs_path "$CHROMA_PATH")"

confirm_destructive_action

log "清空上传目录：$UPLOAD_DIR_PATH"
reset_directory "$UPLOAD_DIR_PATH" "UPLOAD_DIR"

log "清空标准化目录：$NORMALIZED_DIR_PATH"
reset_directory "$NORMALIZED_DIR_PATH" "NORMALIZED_DIR"

log "清空向量索引目录：$CHROMA_PATH_PATH"
reset_directory "$CHROMA_PATH_PATH" "CHROMA_PATH"

log "删除 SQLite 文件：$SQLITE_PATH_PATH"
reset_file "$SQLITE_PATH_PATH" "SQLITE_PATH"

if ! $SKIP_MIGRATE; then
  log "重新执行 Alembic migration"
  run_migration
else
  log "已跳过 migration"
fi

log "本地数据已重置完成"
printf 'SQLite: %s\n' "$SQLITE_PATH_PATH"
