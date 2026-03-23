set shell := ["bash", "-cu"]

api_dir := "apps/api"
web_dir := "apps/web"
docker_script := "scripts/docker-deploy.sh"
reset_script := "./reset-local-data.sh"
dev_script := "scripts/dev-run.sh"

# 默认端口（可通过环境变量覆盖）
api_port := env("API_PORT", "8000")
web_port := env("WEB_PORT", "3000")

# 默认 .env 路径
env_file := ".env"

default: help

# 常用别名
alias d := dev
alias t := test
alias dc := docker-up

# 仓库入口
help:
    @just --list

# 环境准备
init-env:
    cp .env.example {{env_file}}

# 安装依赖
setup:
    cd {{api_dir}} && uv sync --all-groups
    cd {{web_dir}} && vp install

# 本地开发
api-migrate:
    cd {{api_dir}} && uv run python -m alembic upgrade head

api-dev:
    cd {{api_dir}} && uv run python -m alembic upgrade head && uv run -m uvicorn knowledge_chatbox_api.main:app --reload --host 0.0.0.0 --port {{api_port}}

web-dev:
    cd {{web_dir}} && vp dev --host 0.0.0.0 --port {{web_port}}

dev:
    {{dev_script}}

# 检查与测试
repo-check:
    uv run --project {{api_dir}} python scripts/check_repo_surface.py

api-check:
    cd {{api_dir}} && uv run ruff check && uv run ruff format --check && uv run basedpyright

api-test:
    cd {{api_dir}} && uv run --group dev python -m pytest

web-check:
    cd {{web_dir}} && vp run api:check && vp check --fix

web-test:
    cd {{web_dir}} && vp test

web-build:
    cd {{web_dir}} && vp run api:check && vp build

test: repo-check api-check api-test web-check web-test

# 本地数据
reset-data:
    {{reset_script}} --yes

reset-dev:
    {{reset_script}} --yes
    cd {{api_dir}} && uv sync --all-groups
    cd {{web_dir}} && vp install
    {{dev_script}}

# Docker / 单机部署
docker-check:
    {{docker_script}} check

docker-build:
    {{docker_script}} build

docker-up:
    {{docker_script}} up

docker-down:
    {{docker_script}} down

docker-restart:
    {{docker_script}} restart

docker-ps:
    {{docker_script}} ps

docker-health:
    {{docker_script}} health

docker-logs service='':
    test -n "{{service}}" && {{docker_script}} logs "{{service}}" || {{docker_script}} logs
