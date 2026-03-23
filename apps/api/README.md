# Knowledge Chatbox API

> Knowledge Chatbox 的后端 API 服务

`apps/api` 负责认证、用户管理、资源入库、检索问答、系统设置，以及启动时的初始化与补偿。这里主要记录后端包内需要长期维护的工程信息：职责划分、目录入口、运行约束、环境变量、验证命令和排查入口。

系统边界、前端协作关系、数据库设计和运行时链路，以 `docs/arch/*` 为准；这里不再平行维护整套系统说明。

## 先读哪里

第一次接手后端，建议先看：

- [docs/arch/system-overview.md](../../docs/arch/system-overview.md)
- [docs/arch/provider-and-settings.md](../../docs/arch/provider-and-settings.md)
- [docs/arch/api-surface-and-permissions.md](../../docs/arch/api-surface-and-permissions.md)
- [docs/arch/database-design.md](../../docs/arch/database-design.md)
- [docs/arch/runtime-flows.md](../../docs/arch/runtime-flows.md)

## 技术栈

- Python 3.12
- FastAPI
- SQLAlchemy 2.0
- Alembic
- Pydantic v2 / pydantic-settings
- SQLite
- Chroma
- PyJWT
- OpenAI / Anthropic / Voyage / Ollama
- structlog / asgi-correlation-id
- uv
- Ruff / pytest / pytest-httpx

## 这个包负责什么

如果你只想先建立一张脑内地图，可以把后端职责压缩成三块：HTTP 与权限、业务编排、存储协调。

### HTTP 与权限

- 登录、刷新 access token、登出、获取当前用户
- 用户管理
- 设置读取、更新、连接测试
- 资源上传、列表、删除、重建索引
- 会话、消息、同步问答、流式问答
- 会话级 `reasoning_mode` 覆盖当前聊天运行参数

### 业务编排

- 默认管理员 bootstrap
- personal space bootstrap
- 文档标准化、切块、向量索引
- 同步与流式问答
- 流式事件顺序分配、assistant projection 持久化与失败补偿
- 启动时处理中资源补偿、残留活跃 run 补偿与索引重建状态补偿

### 存储协调

- SQLite：业务真相源
- Chroma：检索派生索引
- `uploads / normalized`：原始文件和标准化结果

## 启动补偿

API 启动不是“只起一个 Web 服务”，还会执行一轮 bootstrap，把默认数据和异常中断后的残留状态一起收拾干净：

1. 确保默认 `admin` 存在
2. 确保管理员 personal `space`
3. 确保全局 `app_settings`
4. 把残留 `processing` 文档补偿为 `failed`
5. 把残留 `pending / running` 的 chat run 补偿为 `failed`
6. 把残留 `running` 的索引重建状态补偿为 `failed`

对应代码：

- `src/knowledge_chatbox_api/main.py`
- `src/knowledge_chatbox_api/repositories/space_repository.py`
- `src/knowledge_chatbox_api/tasks/document_jobs.py`

## 目录与入口

```text
apps/api/
  src/knowledge_chatbox_api/
    api/           # 路由与依赖注入
    core/          # 配置、日志、安全能力
    db/            # 数据库引擎与会话工厂
    models/        # SQLAlchemy 模型
    providers/     # OpenAI / Anthropic / Voyage / Ollama capability adapters
    repositories/  # 数据访问层
    schemas/       # 请求/响应模型
    services/      # 认证、聊天、文档、设置等业务服务
    tasks/         # 启动补偿任务
    utils/         # 文件、哈希、Chroma 等工具
  migrations/      # Alembic migration
  tests/           # 后端测试
  docker-entrypoint.sh
  Dockerfile
```

建议阅读顺序：

1. `main.py`
2. `api/routes/*`
3. `services/*`
4. `repositories/*` 和 `models/*`

## 核心路由分组

| 路由前缀 | 作用 | 主要入口 |
| --- | --- | --- |
| `/api/auth` | 登录态、登录、刷新 access token、登出、改密 | `api/routes/auth.py` |
| `/api/users` | 管理员用户管理 | `api/routes/users.py` |
| `/api/documents` | 资源上传、列表、版本、重建索引、下载文件 | `api/routes/documents.py` |
| `/api/chat` | 会话、消息、同步问答、流式问答、活动 run | `api/routes/chat.py` |
| `/api/settings` | 系统 provider 配置、系统提示词、连接测试 | `api/routes/settings.py` |
| `/api/health` | 基础健康检查 | `api/routes/health.py` |
| `/api/health/capabilities` | 当前 response / embedding / vision route 健康检查 | `api/routes/health.py` |

## 本地开发

`uv` 是这个包使用的 Python 依赖与运行入口，项目主页见 [astral-sh/uv](https://github.com/astral-sh/uv)。这个包里的依赖安装、命令执行和本地开发都通过 `uv` 统一完成。

```bash
cd apps/api
uv sync --group dev
uv run ruff check
uv run ruff format --check
uv run basedpyright
uv run --group dev python -m pytest
uv run python -m alembic upgrade head
uv run -m uvicorn knowledge_chatbox_api.main:app --reload --host 0.0.0.0 --port 8000
```

如果只想快速起服务，至少先做 migration：

```bash
cd apps/api
uv run python -m alembic upgrade head
uv run -m uvicorn knowledge_chatbox_api.main:app --reload --host 0.0.0.0 --port 8000
```

如果你要的是本地单机稳定运行，不要继续用 `uvicorn --reload`，请回到仓库根目录看 `README.md` 的 Docker / 单机部署部分，入口是 `just docker-up`。

## 运行约束

- 配置统一从仓库根目录 `.env` 读取，路径类变量按仓库根目录解析
- API 启动后默认暴露 `/docs`、`/redoc`、`/openapi.json`；它们与 `scripts/export_openapi.py` 共用同一份 FastAPI OpenAPI 真相源
- 数据默认落在 `data/uploads`、`data/normalized`、`data/sqlite`、`data/chroma`
- SQLite 连接默认开启 `WAL` 和 `busy_timeout=30000`；API 响应头与日志都带 `X-Request-ID` / `request_id`
- 当前认证是“`PyJWT` 短期 access token + 服务端 refresh session”混合模式；受保护接口、资源上传和 SSE 流式聊天都优先接受 `Authorization: Bearer <token>`
- provider 设置收敛到 `app_settings` 一条记录，核心字段是 `provider_profiles_json`、`response_route_json`、`embedding_route_json`、`pending_embedding_route_json`、`vision_route_json`
- 当前 capability route 支持独立选择 `response / embedding / vision`；切换检索 provider 或 embedding model 会触发后台 generation 重建
- 后端业务异常统一返回 `Envelope(success=false, error={ code, message, details })`
- `/api/auth/me`、`/api/settings` 这类受保护读取接口在鉴权阶段保持纯读，避免长时间流式写入把标准页面读取锁成 `500 database is locked`
- 流式问答的 assistant projection 与 run event 当前按短批次提交，避免整段回答长期持有 SQLite 写事务，把会话改名、新建会话这类并发写操作一起锁住
- 文档相关稳定错误码：
  - `404 document_not_found`
  - `409 document_not_normalized`
  - `500 document_upload_failed`
- 聊天检索、附件限域、多附件合并、OpenClaw 归一匹配和 Chroma `where` 归一化等更细语义，统一以 [docs/arch/system-overview.md](../../docs/arch/system-overview.md) 和 [docs/arch/runtime-flows.md](../../docs/arch/runtime-flows.md) 为准

## 主要环境变量

- 核心运行：`API_HOST`、`API_PORT`、`LOG_LEVEL`、`CORS_ALLOW_ORIGINS`
- 认证：`ACCESS_TOKEN_TTL_MINUTES`、`JWT_ALGORITHM`、`JWT_SECRET_KEY`
- 初始化：admin bootstrap 的 `INITIAL_ADMIN_USERNAME`、`INITIAL_ADMIN_PASSWORD`
- 路径：`UPLOAD_DIR`、`NORMALIZED_DIR`、`SQLITE_PATH`、`CHROMA_PATH`
- Provider bootstrap：`INITIAL_RESPONSE_PROVIDER`、`INITIAL_EMBEDDING_PROVIDER`、`INITIAL_VISION_PROVIDER`，以及各 provider 对应的 `API_KEY / BASE_URL / *_MODEL`
- 默认模型与完整示例以仓库根目录 `.env.example` 为准；如果只想核对 provider 语义，再看 [docs/arch/provider-and-settings.md](../../docs/arch/provider-and-settings.md)

## 容器与脚本

- `docker-entrypoint.sh`：准备 `/workspace/data/*`、执行 migration、启动 `uvicorn`
- `Dockerfile`：builder 阶段用 `uv` 安装依赖并通过 BuildKit cache mount 复用下载缓存，runtime 阶段只保留虚拟环境、迁移文件、源码和 entrypoint
- 根目录入口：

```bash
just init-env
scripts/docker-deploy.sh check
scripts/docker-deploy.sh build
scripts/docker-deploy.sh up
scripts/docker-deploy.sh health
scripts/docker-deploy.sh down
./reset-local-data.sh --yes
```

更细的容器拓扑、Compose 语义和重置数据 runbook 见 [docs/arch/deployment-and-operations.md](../../docs/arch/deployment-and-operations.md)。

## 测试与验证

提交前建议至少执行：

```bash
cd apps/api
uv run ruff check
uv run ruff format --check
uv run basedpyright
uv run --group dev python -m pytest
```

如果你改了启动链路、数据目录或容器相关逻辑，再补一轮：

```bash
just init-env
scripts/docker-deploy.sh check
scripts/docker-deploy.sh build
```

补充约定：

- `apps/api/tests/conftest.py` 当前统一收敛 TestClient、环境变量、SQLite/Chroma 临时目录，以及 HTTPS / `SESSION_COOKIE_SECURE` 相关测试场景；新增 API 集成测试时优先复用这里的 helper，而不是在各测试文件里重复拼装初始化流程

## 排查入口

### 上传问题

先看：

- `document_revisions.ingest_status`
- `document_revisions.error_message`
- `origin_path / normalized_path`
- Chroma 是否存在对应资源 chunk

### 问答问题

先看：

- 当前 `app_settings.embedding_route_json / pending_embedding_route_json` 与 `app_settings.active/building_index_generation`
- 当前 `active_index_generation`、`building_index_generation`、`index_rebuild_status`
- 同步问答时 `chat_messages.status`
- 流式问答时 `chat_runs.status` 和 `chat_run_events(run_id, seq)`
- 若带附件的流式问答在 `tool.call` 后直接失败，优先检查 `services/chat/chat_service.py` 生成的检索过滤条件，以及 `utils/chroma.py` 是否已把复合条件归一化成 Chroma 兼容 `where`
- 资源是否已经成功 `indexed`

### 启动问题

先看：

- migration 是否已经到 `head`
- `.env` 路径配置是否正确
- 宿主机 Ollama 地址是否可达
- 启动期 bootstrap 是否在日志里成功执行
