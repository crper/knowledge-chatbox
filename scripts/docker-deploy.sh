#!/usr/bin/env bash
set -Eeuo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

log() {
  printf '[docker-deploy] %s\n' "$*"
}

die() {
  printf '[docker-deploy] %s\n' "$*" >&2
  exit 1
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

COMPOSE_FILE="$(resolve_fs_path "${COMPOSE_FILE:-${ROOT_DIR}/docker-compose.yml}")"
ENV_FILE="$(resolve_fs_path "${ENV_FILE:-${ROOT_DIR}/.env}")"
readonly ROOT_DIR COMPOSE_FILE ENV_FILE

compose_cmd() {
  env "ENV_FILE=${ENV_FILE}" docker compose --env-file "${ENV_FILE}" -f "${COMPOSE_FILE}" "$@"
}

require_command() {
  command -v "$1" >/dev/null 2>&1 || die "缺少命令：$1"
}

ensure_env_file() {
  [[ -f "${ENV_FILE}" ]] || die "缺少环境文件：${ENV_FILE}，请先执行 cp .env.example .env"
}

ensure_compose_file() {
  [[ -f "${COMPOSE_FILE}" ]] || die "缺少 Compose 文件：${COMPOSE_FILE}"
}

ensure_docker_daemon() {
  docker info >/dev/null 2>&1 || die "Docker daemon 未启动，请先启动 Docker"
}

ensure_compose_cli_context() {
  require_command docker
  ensure_compose_file
  ensure_env_file
}

ensure_compose_runtime_context() {
  ensure_compose_cli_context
  ensure_docker_daemon
}

# 让 Compose 自己解析 env_file 和变量默认值，避免把 .env 当 shell 脚本执行。
load_runtime_env() {
  local key value

  while IFS='=' read -r key value; do
    case "$key" in
      API_PORT|WEB_PORT|VITE_API_BASE_URL|UPLOAD_DIR|NORMALIZED_DIR|SQLITE_PATH|CHROMA_PATH|INITIAL_ADMIN_USERNAME|INITIAL_ADMIN_PASSWORD)
        printf -v "$key" '%s' "$value"
        ;;
    esac
  done < <(compose_cmd config --environment)
}

require_non_empty() {
  local var_name

  for var_name in "$@"; do
    [[ -n "${!var_name:-}" ]] || die ".env 缺少必填项：$var_name"
  done
}

validate_port() {
  local var_name="$1"
  local value="${!var_name:-}"

  [[ "$value" =~ ^[0-9]+$ ]] || die "$var_name 必须是 1-65535 的整数，当前值：$value"
  ((value >= 1 && value <= 65535)) || die "$var_name 必须是 1-65535 的整数，当前值：$value"
}

validate_url() {
  local var_name="$1"
  local value="${!var_name:-}"

  [[ "$value" =~ ^https?://[^[:space:]]+$ ]] || die "$var_name 必须是 http(s) URL，当前值：$value"
}

validate_directory_target() {
  local path="$1"
  local label="$2"
  local parent_dir

  if [[ -e "$path" && ! -d "$path" ]]; then
    die "$label 必须指向目录：$path"
  fi

  parent_dir="$(dirname "$path")"
  if [[ -e "$parent_dir" && ! -d "$parent_dir" ]]; then
    die "$label 的父目录不是目录：$parent_dir"
  fi
}

validate_file_target() {
  local path="$1"
  local label="$2"
  local parent_dir

  if [[ -e "$path" && -d "$path" ]]; then
    die "$label 必须指向文件，不能是目录：$path"
  fi

  parent_dir="$(dirname "$path")"
  if [[ -e "$parent_dir" && ! -d "$parent_dir" ]]; then
    die "$label 的父目录不是目录：$parent_dir"
  fi
}

resolve_runtime_path() {
  resolve_fs_path "$1"
}

validate_host_paths() {
  local upload_dir normalized_dir sqlite_path chroma_path
  upload_dir="$(resolve_runtime_path "${UPLOAD_DIR:-./data/uploads}")"
  normalized_dir="$(resolve_runtime_path "${NORMALIZED_DIR:-./data/normalized}")"
  sqlite_path="$(resolve_runtime_path "${SQLITE_PATH:-./data/sqlite/ai_qa.db}")"
  chroma_path="$(resolve_runtime_path "${CHROMA_PATH:-./data/chroma}")"

  validate_directory_target "$upload_dir" "UPLOAD_DIR"
  validate_directory_target "$normalized_dir" "NORMALIZED_DIR"
  validate_directory_target "$chroma_path" "CHROMA_PATH"
  validate_file_target "$sqlite_path" "SQLITE_PATH"
}

# 只有真正启动容器前才准备宿主机目录，避免 check/build 带来副作用。
prepare_host_paths() {
  local upload_dir normalized_dir sqlite_path chroma_path
  upload_dir="$(resolve_runtime_path "${UPLOAD_DIR:-./data/uploads}")"
  normalized_dir="$(resolve_runtime_path "${NORMALIZED_DIR:-./data/normalized}")"
  sqlite_path="$(resolve_runtime_path "${SQLITE_PATH:-./data/sqlite/ai_qa.db}")"
  chroma_path="$(resolve_runtime_path "${CHROMA_PATH:-./data/chroma}")"

  mkdir -p "$upload_dir" "$normalized_dir" "$(dirname "$sqlite_path")" "$chroma_path"

  touch "$sqlite_path"
}

validate_env() {
  require_non_empty WEB_PORT API_PORT VITE_API_BASE_URL INITIAL_ADMIN_USERNAME INITIAL_ADMIN_PASSWORD
  validate_port WEB_PORT
  validate_port API_PORT
  validate_url VITE_API_BASE_URL
}

wait_for_http() {
  local name="$1"
  local url="$2"
  local max_attempts="${3:-30}"
  local attempt

  for ((attempt = 1; attempt <= max_attempts; attempt += 1)); do
    if curl --fail --silent --show-error --max-time 3 "$url" >/dev/null; then
      log "$name 已就绪：$url"
      return 0
    fi
    sleep 2
  done

  log "当前容器状态："
  compose_cmd ps || true
  die "$name 健康检查失败：$url"
}

prepare_compose_env() {
  ensure_compose_cli_context
  load_runtime_env
  validate_env
  validate_host_paths
}

check() {
  prepare_compose_env
  log "校验 Compose 配置"
  compose_cmd config -q
}

up() {
  require_command curl
  ensure_compose_runtime_context
  prepare_compose_env
  prepare_host_paths
  log "校验 Compose 配置"
  compose_cmd config -q
  log "启动服务"
  compose_cmd up -d --remove-orphans
  health
  compose_cmd ps
}

down() {
  ensure_compose_runtime_context
  log "停止服务"
  compose_cmd down --remove-orphans
}

restart() {
  ensure_compose_runtime_context
  prepare_compose_env
  log "重启服务"
  compose_cmd restart
  health
}

build() {
  ensure_compose_runtime_context
  prepare_compose_env
  log "构建镜像"
  compose_cmd build
}

ps() {
  ensure_compose_runtime_context
  compose_cmd ps
}

logs() {
  ensure_compose_runtime_context
  compose_cmd logs -f --tail=200 "$@"
}

health() {
  require_command curl
  prepare_compose_env
  wait_for_http "API" "http://127.0.0.1:${API_PORT:-8000}/api/health"
  wait_for_http "Web" "http://127.0.0.1:${WEB_PORT:-3000}/healthz"
}

usage() {
  cat <<'EOF'
用法：
  scripts/docker-deploy.sh check
  scripts/docker-deploy.sh build
  scripts/docker-deploy.sh up
  scripts/docker-deploy.sh down
  scripts/docker-deploy.sh restart
  scripts/docker-deploy.sh ps
  scripts/docker-deploy.sh status
  scripts/docker-deploy.sh logs [service]
  scripts/docker-deploy.sh health

可选环境变量：
  ENV_FILE=/abs/path/.env
  COMPOSE_FILE=/abs/path/docker-compose.yml

仓库根目录也提供等价入口：
  just docker-check / build / up / down / restart / ps / logs / health
EOF
}

main() {
  local command="${1:-}"

  case "$command" in
    check) shift; check "$@" ;;
    build) shift; build "$@" ;;
    up) shift; up "$@" ;;
    down) shift; down "$@" ;;
    restart) shift; restart "$@" ;;
    ps) shift; ps "$@" ;;
    status) shift; ps "$@" ;;
    logs) shift; logs "$@" ;;
    health) shift; health "$@" ;;
    ""|-h|--help|help) usage ;;
    *) die "未知命令：$command" ;;
  esac
}

main "$@"
