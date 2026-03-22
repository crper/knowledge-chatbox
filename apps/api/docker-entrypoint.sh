#!/bin/sh
set -eu

log() {
  printf '[api-entrypoint] %s\n' "$*"
}

prepare_runtime_dirs() {
  # bind mount 首次挂载时可能还没有目录，先补齐目录结构，避免写入失败。
  log "准备运行目录"
  mkdir -p \
    /workspace/data/uploads \
    /workspace/data/normalized \
    /workspace/data/sqlite \
    /workspace/data/chroma
}

run_migrations() {
  log "执行 Alembic migration"
  python -m alembic upgrade head
}

start_api() {
  log "启动 API 服务"
  exec python -m uvicorn knowledge_chatbox_api.main:app --host 0.0.0.0 --port "${API_PORT:-8000}"
}

prepare_runtime_dirs
run_migrations
start_api
