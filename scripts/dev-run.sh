#!/usr/bin/env bash
set -Eeuo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
API_DIR="${API_DIR:-${ROOT_DIR}/apps/api}"
WEB_DIR="${WEB_DIR:-${ROOT_DIR}/apps/web}"
API_PORT="${API_PORT:-8000}"
WEB_PORT="${WEB_PORT:-3000}"

log() {
  printf '[dev-run] %s\n' "$*"
}

print_urls() {
  cat <<EOF
[dev-run] 访问地址（服务启动后可用）
[dev-run]   Web: http://localhost:${WEB_PORT}
[dev-run]   API health: http://localhost:${API_PORT}/api/health
[dev-run]   API docs: http://localhost:${API_PORT}/docs
[dev-run]   API redoc: http://localhost:${API_PORT}/redoc
[dev-run]   OpenAPI JSON: http://localhost:${API_PORT}/openapi.json
EOF
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

log "启动 Web：$WEB_DIR"
(
  cd "$WEB_DIR" &&
  exec vp dev --host 0.0.0.0 --port "$WEB_PORT"
) &
web_pid=$!
pids+=("$web_pid")

print_urls

status=0
if wait_for_exit; then
  status=0
else
  status=$?
fi
exit "$status"
