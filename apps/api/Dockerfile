# syntax=docker/dockerfile:1.7

FROM ghcr.io/astral-sh/uv:python3.12-bookworm-slim AS builder

ENV UV_LINK_MODE=copy \
    UV_COMPILE_BYTECODE=1 \
    UV_PROJECT_ENVIRONMENT=/opt/venv

WORKDIR /workspace/apps/api

# 先只复制依赖清单，尽量复用依赖层缓存。
COPY apps/api/pyproject.toml apps/api/uv.lock ./
RUN --mount=type=cache,target=/root/.cache/uv \
    uv sync --frozen --no-dev --no-install-project

# 项目安装阶段再引入 README 和源码，避免 README 变更击穿依赖缓存。
COPY apps/api/README.md apps/api/alembic.ini ./
COPY apps/api/migrations ./migrations
COPY apps/api/src ./src

RUN --mount=type=cache,target=/root/.cache/uv \
    uv sync --frozen --no-dev

FROM python:3.12-slim

ENV PATH="/opt/venv/bin:$PATH" \
    PYTHONDONTWRITEBYTECODE=1 \
    PYTHONPATH=/workspace/apps/api/src \
    PYTHONUNBUFFERED=1

WORKDIR /workspace/apps/api

RUN groupadd --gid 1000 appuser && \
    useradd --uid 1000 --gid appuser --shell /bin/sh --create-home appuser

# 运行时镜像只保留虚拟环境和应用代码，不带构建阶段的 uv 工具链。
COPY --from=builder /opt/venv /opt/venv
COPY --from=builder /workspace/apps/api/alembic.ini ./alembic.ini
COPY --from=builder /workspace/apps/api/migrations ./migrations
COPY --from=builder /workspace/apps/api/src ./src
COPY --chmod=755 scripts/api-entrypoint.sh ./api-entrypoint.sh

RUN mkdir -p /workspace/data/uploads /workspace/data/normalized \
    /workspace/data/sqlite /workspace/data/chroma && \
    chown -R appuser:appuser /workspace/data

USER appuser

EXPOSE 8000

ENTRYPOINT ["./api-entrypoint.sh"]
