# Knowledge Chatbox API

> Knowledge Chatbox 的后端 API 服务

`apps/api` 负责认证、用户管理、资源入库、检索问答、系统设置，以及启动时的初始化与补偿。这里主要记录后端包内需要长期维护的工程信息：职责划分、目录入口、运行约束、环境变量、验证命令和排查入口。

接手这个包前，先回仓库根目录看根 [README.md](../../README.md) 的唯一官方开发主线；这里不再重复维护仓库级启动流程，只补充后端包内命令和运行边界。

系统边界、前端协作关系、数据库设计和运行时链路，以 `docs/arch/*` 为准；这里不再平行维护整套系统说明。

## 先读哪里

第一次接手后端，建议先看：

- [README.md](../../README.md)
- [CONTRIBUTING.md](../../CONTRIBUTING.md)
- [docs/arch/system-overview.md](../../docs/arch/system-overview.md)
- [docs/arch/provider-and-settings.md](../../docs/arch/provider-and-settings.md)
- [docs/arch/api-surface-and-permissions.md](../../docs/arch/api-surface-and-permissions.md)
- [docs/arch/database-design.md](../../docs/arch/database-design.md)
- [docs/arch/runtime-flows.md](../../docs/arch/runtime-flows.md)

## 技术栈

- Python 3.13（当前固定 3.13.13，见 `apps/api/.python-version`）
- FastAPI
- SQLAlchemy 2.0
- Alembic
- Pydantic v2 / pydantic-settings
- PydanticAI
- SQLite
- Chroma
- PyJWT
- OpenAI / Anthropic / Voyage / Ollama
- structlog / asgi-correlation-id
- orjson（SSE 流式序列化）
- uv
- Ruff / pytest / pytest-asyncio / pytest-httpx

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

API 启动不是"只起一个 Web 服务"，还会执行一轮 bootstrap，把默认数据和异常中断后的残留状态一起收拾干净：

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
    core/          # 配置、日志、安全能力，以及共享 service builder
    db/            # 数据库引擎与会话工厂
    models/        # SQLAlchemy 模型
    providers/     # OpenAI / Anthropic / Voyage / Ollama capability adapters
    repositories/  # 数据访问层
    schemas/       # 请求/响应模型
    services/      # 认证、聊天、文档、设置等业务服务
    tasks/         # 启动补偿任务
    utils/         # 文件、哈希、Chroma 等工具
  migrations/      # Alembic migration
  tests/
    integration/   # API / provider / 文档链路集成测试
    unit/          # 纯服务 / 仓储 / 工具单测
    runtime/       # just / 脚本 / 仓库入口运行时约束
    migrations/    # migration smoke tests
    fixtures/      # 测试工厂与复用 helper
  Dockerfile

scripts/
  api-entrypoint.sh
```

建议阅读顺序：

1. `main.py`
2. `api/routes/*`
3. `api/deps.py` 与 `core/service_builders.py`
4. `services/*`
5. `repositories/*` 和 `models/*`

## 核心路由分组

| 路由前缀                   | 作用                                                             | 主要入口                  |
| -------------------------- | ---------------------------------------------------------------- | ------------------------- |
| `/api/auth`                | 登录态、登录、刷新 access token、登出、改密                      | `api/routes/auth.py`      |
| `/api/users`               | 管理员用户管理                                                   | `api/routes/users.py`     |
| `/api/documents`           | 资源上传前置条件、上传、列表、版本、重建索引、下载文件           | `api/routes/documents.py` |
| `/api/chat`                | 会话、分页消息读取、会话上下文摘要、同步问答、流式问答、活动 run、运行中取消 | `api/routes/chat.py`      |
| `/api/settings`            | 系统 provider 配置、系统提示词、连接测试                         | `api/routes/settings.py`  |
| `/api/health`              | 基础健康检查                                                     | `api/routes/health.py`    |
| `/api/health/capabilities` | 当前 response / embedding / vision route 健康检查                | `api/routes/health.py`    |

## 本地开发

`uv` 是这个包使用的 Python 依赖与运行入口，项目主页见 [astral-sh/uv](https://github.com/astral-sh/uv)。这个包里的依赖安装、命令执行和本地开发都通过 `uv` 统一完成。

这些命令默认建立在仓库根目录已经执行过 `just setup` 的前提上；如果你只是想补齐整个仓库依赖，优先回根目录继续用 `just setup`。

```bash
cd apps/api
uv run ruff check
uv run ruff format --check
uv run basedpyright
uv run basedpyright --project pyproject.test.toml
uv run --group dev python -m pytest
uv run python -m alembic upgrade head
uv run -m uvicorn knowledge_chatbox_api.main:app --reload --host 0.0.0.0 --port 8000
```

如果你明确只想在包内单独补依赖，再执行：

```bash
cd apps/api
uv sync --all-groups
```

如果只想快速起服务，至少先做 migration：

```bash
cd apps/api
uv run python -m alembic upgrade head
uv run -m uvicorn knowledge_chatbox_api.main:app --reload --host 0.0.0.0 --port 8000
```

如果你要的是本地单机稳定运行，不要继续用 `uvicorn --reload`，请回到仓库根目录看 `README.md` 的 Docker / 单机部署部分，入口是 `just docker-up`。

## 运行约束

### API 行为与错误码

- 配置统一从仓库根目录 `.env` 读取，路径类变量按仓库根目录解析
- API 启动后默认暴露 `/docs`、`/redoc`、`/openapi.json`；它们与 `scripts/export_openapi.py` 共用同一份 FastAPI OpenAPI 真相源
- 后端业务异常统一返回 `Envelope(success=false, error={ code, message, details })`
- 文档相关稳定错误码：`409 embedding_not_configured`、`404 document_not_found`、`409 document_not_normalized`、`409 pending_embedding_not_configured`、`500 document_upload_failed`

### 认证与 Cookie

- 当前认证是"`PyJWT` 短期 access token + 服务端 refresh session"混合模式
- 受保护接口、资源上传和 SSE 流式问答都优先接受 `Authorization: Bearer <token>`
- same-origin Web 部署仍使用相对 `/api/*` 路径，不依赖绝对 API origin
- 启动期会话恢复与业务请求续期当前已分开：前者走 `/api/auth/bootstrap`，匿名态返回 `200 + authenticated=false`；后者仍通过 `/api/auth/refresh` 轮换 refresh session 并续发 access token
- 详细认证时序见 [auth-and-session-flow.md](../../docs/arch/auth-and-session-flow.md)

### 上传与索引

- 数据默认落在 `data/uploads`、`data/normalized`、`data/sqlite`、`data/chroma`
- `/api/documents/upload` 当前会先把上传内容按块落到 `data/uploads`，同时增量计算 `content_hash` 和 `file_size`；命中重复内容时会复用现有修订，并清理本次临时源文件
- `/api/documents/upload-readiness` 返回资源上传所需的最小配置是否就绪；它不是 provider 实时健康检查，只判断当前 settings 形状是否允许进入上传链路
- `/api/documents/upload` 在落盘前先校验 upload readiness：活动 `embedding_route` 缺配置时返回 `409 embedding_not_configured`；索引重建中若 `pending_embedding_route` 缺配置，则返回 `409 pending_embedding_not_configured`
- 文本文档在请求内完成标准化与索引；图片会先返回 `processing`，再由后台任务补做 vision 标准化与索引
- `vision_route` 缺配置时不会阻断图片上传；图片会退化成仅保留基础信息的标准化结果
- 上传链路详细约束见 [system-overview.md](../../docs/arch/system-overview.md) 的资源上传链路

### 聊天执行与检索

- 聊天执行 owner 当前统一由 `services/chat/workflow/*` 驱动，同步和流式问答共享同一套 `ChatWorkflow + PydanticAI` 路径
- 当前轮附件会在进入 `ChatWorkflow` 前先由服务端物化成真实 prompt 内容：文档附件转标准化文本片段，图片附件转稳定 JPEG 多模态 payload
- `/api/chat/sessions/{session_id}/messages` 当前支持可选 `before_id`、`limit`，用于 Web 主区按尾部窗口读取长会话
- `/api/chat/sessions/{session_id}/context` 返回聊天右栏需要的紧凑摘要：已去重附件、最近一次 assistant 引用和对应消息 id
- `/api/chat/runs/{run_id}/cancel` 当前支持显式取消仍处于 `pending / running` 的 run；服务端会尽快终止 workflow 流式执行，并把 `chat_runs.status` 收口为 `cancelled`
- 聊天检索、附件限域、多附件合并和 Chroma `where` 归一化等更细语义，统一以 [runtime-flows.md](../../docs/arch/runtime-flows.md) 为准

### 存储与并发

- SQLite 连接默认开启 `WAL` 和 `busy_timeout=30000`；API 响应头与日志都带 `X-Request-ID` / `request_id`
- `/api/auth/me`、`/api/settings` 这类受保护读取接口在鉴权阶段保持纯读，避免长时间流式写入把标准页面读取锁成 `500 database is locked`
- 流式问答的 assistant projection 与 run event 当前按短批次提交，避免整段回答长期持有 SQLite 写事务

### Provider 与设置

- provider 设置收敛到 `app_settings` 一条记录，核心字段是 `provider_profiles_json`、`response_route_json`、`embedding_route_json`、`pending_embedding_route_json`、`vision_route_json`
- `ollama.base_url` 对外当前统一表示服务根地址，例如 `http://localhost:11434`；如果用户误填了 `/v1`，服务端会在读写设置和运行时自动收口
- 当前 capability route 支持独立选择 `response / embedding / vision`；切换检索 provider 或 embedding model 会触发后台 generation 重建
- 详细设置语义见 [provider-and-settings.md](../../docs/arch/provider-and-settings.md)

## 主要环境变量

| 变量 | 说明 |
|------|------|
| `API_HOST`、`API_PORT`、`LOG_LEVEL`、`CORS_ALLOW_ORIGINS` | 核心运行 |
| `ACCESS_TOKEN_TTL_MINUTES`、`JWT_ALGORITHM`、`JWT_SECRET_KEY` | 认证 |
| `INITIAL_ADMIN_USERNAME`、`INITIAL_ADMIN_PASSWORD` | 初始化 |
| `UPLOAD_DIR`、`NORMALIZED_DIR`、`SQLITE_PATH`、`CHROMA_PATH` | 路径 |
| `INITIAL_RESPONSE_PROVIDER`、`INITIAL_EMBEDDING_PROVIDER`、`INITIAL_VISION_PROVIDER` | Provider bootstrap |
| 各 provider 对应的 `API_KEY / BASE_URL / *_MODEL` | Provider 连接 |

默认模型与完整示例以仓库根目录 `.env.example` 为准；如果只想核对 provider 语义，再看 [provider-and-settings.md](../../docs/arch/provider-and-settings.md)

## 容器与脚本

- `scripts/api-entrypoint.sh`：API 容器启动入口，负责准备 `/workspace/data/*`、执行 migration、启动 `uvicorn`
- `Dockerfile`：以仓库根为 build context；builder 阶段用 `uv` 安装依赖并通过 BuildKit cache mount 复用下载缓存，runtime 阶段只保留虚拟环境、迁移文件、源码和 `scripts/api-entrypoint.sh`
- 根目录入口：

```bash
just init-env
just docker-check
just docker-build
just docker-up
just docker-restart
just docker-health
just docker-down
just reset-data
```

更细的容器拓扑、Compose 语义和重置数据 runbook 见 [deployment-and-operations.md](../../docs/arch/deployment-and-operations.md)。

## 测试与验证

提交前建议至少执行：

```bash
cd apps/api
uv run ruff check
uv run ruff format --check
uv run basedpyright
uv run basedpyright --project pyproject.test.toml
uv run --group dev python -m pytest
```

如果你改了启动链路、数据目录或容器相关逻辑，再补一轮：

```bash
just init-env
scripts/docker-deploy.sh check
scripts/docker-deploy.sh build
```

补充约定：

- 后端测试目录当前以 `tests/integration`、`tests/unit`、`tests/runtime`、`tests/migrations`、`tests/fixtures` 为准
- `apps/api/tests/conftest.py` 当前统一收敛 TestClient、环境变量、SQLite/Chroma 临时目录，以及 HTTPS / `SESSION_COOKIE_SECURE` 相关测试场景；新增 API 集成测试时优先复用这里的 helper
- `apps/api/tests/fixtures/runtime.py` 当前承接测试运行时环境拼装、临时数据库迁移和 `TestClient` 构造；`conftest.py` 主要负责把这些能力暴露成 fixture
- `apps/api/pyproject.toml` 里的 `basedpyright` 只负责 `src`；测试类型检查统一走 `uv run basedpyright --project pyproject.test.toml`
- 原生异步测试统一依赖 `pytest-asyncio` 的 `asyncio_mode = "auto"`；新增 async 单测不要再手写 `asyncio.run(...)`

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
- 同步问答时 `chat_messages.status`
- 流式问答时 `chat_runs.status` 和 `chat_run_events(run_id, seq)`
- 若带附件的流式问答在 `tool.call` 后直接失败，优先检查 `services/chat/retrieval/policy.py` 生成的检索过滤条件，以及 `utils/chroma.py` 是否已把复合条件归一化成 Chroma 兼容 `where`
- 资源是否已经成功 `indexed`

### 启动问题

先看：

- migration 是否已经到 `head`
- `.env` 路径配置是否正确
- 宿主机 Ollama 地址是否可达
- 启动期 bootstrap 是否在日志里成功执行
