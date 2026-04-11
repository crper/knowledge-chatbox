#!/usr/bin/env bash
set -Eeuo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
API_DIR="${API_DIR:-${ROOT_DIR}/apps/api}"
WEB_DIR="${WEB_DIR:-${ROOT_DIR}/apps/web}"
ENV_FILE="${ENV_FILE:-${ROOT_DIR}/.env}"
API_PORT="${API_PORT:-8000}"
WEB_PORT="${WEB_PORT:-3000}"
API_HEALTH_URL="http://127.0.0.1:${API_PORT}/api/health"

require_command() {
  if ! command -v "$1" >/dev/null 2>&1; then
    printf '[dev-run] 缺少命令：%s\n' "$1" >&2
    exit 1
  fi
}

log() {
  printf '[dev-run] %s\n' "$*"
}

read_env_value() {
  local target_key="$1"
  local raw_line

  [[ -f "$ENV_FILE" ]] || return 0
  raw_line="$(grep -E "^${target_key}=" "$ENV_FILE" 2>/dev/null | tail -n 1 || true)"
  [[ -n "$raw_line" ]] || return 0
  printf '%s\n' "${raw_line#*=}"
}

print_urls() {
  log "访问地址（服务启动后可用）"
  log "  Web: http://localhost:${WEB_PORT}"
  log "  API health: http://localhost:${API_PORT}/api/health"
  log "  API docs: http://localhost:${API_PORT}/docs"
  log "  API redoc: http://localhost:${API_PORT}/redoc"
  log "  OpenAPI JSON: http://localhost:${API_PORT}/openapi.json"

  local admin_username
  local admin_password
  admin_username="$(read_env_value INITIAL_ADMIN_USERNAME)"
  admin_username="${admin_username:-admin}"
  log "  Bootstrap admin: ${admin_username}"
  if [[ -f "$ENV_FILE" ]]; then
    admin_password="$(read_env_value INITIAL_ADMIN_PASSWORD)"
    if [[ -n "$admin_password" ]]; then
      log "  登录密码请查看 ${ENV_FILE} 中的 INITIAL_ADMIN_PASSWORD"
    else
      log "  未检测到 INITIAL_ADMIN_PASSWORD，请先运行 just init-env"
    fi
  fi
}

cleanup() {
  trap - EXIT INT TERM

  for pid in "${pids[@]}"; do
    kill "$pid" 2>/dev/null || true
  done

  wait 2>/dev/null || true
}

on_int() {
  cleanup
  exit 130
}

on_term() {
  cleanup
  exit 143
}

wait_for_api_ready() {
  local max_attempts="${DEV_API_READY_MAX_ATTEMPTS:-300}"
  local attempt

  require_command curl

  for ((attempt = 1; attempt <= max_attempts; attempt += 1)); do
    if curl --fail --silent --max-time 1 "$API_HEALTH_URL" >/dev/null 2>&1; then
      log "API 已就绪：$API_HEALTH_URL"
      return 0
    fi

    if ! kill -0 "$api_pid" 2>/dev/null; then
      local status=0
      wait "$api_pid" || status=$?
      log "API 已退出"
      return "$status"
    fi

    sleep 0.2
  done

  log "API 启动超时：$API_HEALTH_URL"
  return 1
}

wait_for_exit() {
  while true; do
    if ! kill -0 "$api_pid" 2>/dev/null; then
      local status=0
      wait "$api_pid" || status=$?
      log "API 已退出"
      return "$status"
    fi

    if ! kill -0 "$web_pid" 2>/dev/null; then
      local status=0
      wait "$web_pid" || status=$?
      log "Web 已退出"
      return "$status"
    fi

    sleep 1
  done
}

pids=()
trap cleanup EXIT
trap on_int INT
trap on_term TERM

log "启动 API：$API_DIR"
(
  cd "$API_DIR" &&
  uv run python -m alembic upgrade head &&
  exec uv run -m uvicorn knowledge_chatbox_api.main:app --reload --host 0.0.0.0 --port "$API_PORT"
) &
api_pid=$!
pids+=("$api_pid")

print_urls

if ! wait_for_api_ready; then
  exit $?
fi

log "启动 Web：$WEB_DIR"
(
  cd "$WEB_DIR" &&
  exec vp dev --host 0.0.0.0 --port "$WEB_PORT"
) &
web_pid=$!
pids+=("$web_pid")

status=0
if wait_for_exit; then
  status=0
else
  status=$?
fi
exit "$status"
