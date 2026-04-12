set shell := ["bash", "-cu"]

api_dir := "apps/api"
web_dir := "apps/web"
docker_script := "scripts/docker-deploy.sh"
reset_script := "./scripts/reset-local-data.sh"
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
    @printf '%s\n' \
        'Knowledge Chatbox 常用入口' \
        '' \
        '  just init-env     初始化 .env，并自动补齐本地开发所需密钥' \
        '  just setup        安装后端和前端依赖' \
        '  just dev          启动前后端开发环境' \
        '  just test         跑仓库级检查与测试' \
        '  just reset-data   清空本地数据并重建 schema' \
        '  just reset-dev    清空本地数据、重装依赖并重启开发环境' \
        '  just docker-up    启动 Docker Compose 单机环境' \
        '  just docker-down  停止 Docker Compose 环境' \
        '' \
        '高级入口仍可用，执行 just --list 查看完整命令。'

# 环境准备
init-env:
    cp -n .env.example {{env_file}} 2>/dev/null || true
    @python3 -c 'from pathlib import Path; import secrets, string, sys; env_path = Path(sys.argv[1]); special = "!@#$%^&*()-_=+"; alphabet = string.ascii_letters + string.digits + special; password_chars = [secrets.choice(string.ascii_uppercase), secrets.choice(string.ascii_lowercase), secrets.choice(string.digits), secrets.choice(special)] + [secrets.choice(alphabet) for _ in range(12)]; secrets.SystemRandom().shuffle(password_chars); generated_password = "".join(password_chars); lines = env_path.read_text(encoding="utf-8").splitlines(); updated_lines = [f"JWT_SECRET_KEY={secrets.token_urlsafe(32)}" if line == "JWT_SECRET_KEY=" else f"INITIAL_ADMIN_PASSWORD={generated_password}" if line == "INITIAL_ADMIN_PASSWORD=" else line for line in lines]; env_path.write_text("\n".join(updated_lines) + "\n", encoding="utf-8")' "{{env_file}}"
    @printf '[just init-env] 已准备 %s\n' "{{env_file}}"
    @printf '[just init-env] 管理员用户名默认是 admin，登录密码请查看 %s 中的 INITIAL_ADMIN_PASSWORD\n' "{{env_file}}"

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
    API_PORT={{api_port}} WEB_PORT={{web_port}} {{dev_script}}

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
    API_PORT={{api_port}} WEB_PORT={{web_port}} {{dev_script}}

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
