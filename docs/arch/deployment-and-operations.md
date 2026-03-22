# 部署与运维

这份文档只覆盖仓库当前真的在维护的运行入口：本地开发、Docker Compose 单机部署、数据重置和 OpenAPI 导出。重点不是让你背命令，而是让你知道每个入口会做哪些副作用、适合什么时候用。配套阅读：

- [system-overview.md](./system-overview.md)
- [repo-map-and-conventions.md](./repo-map-and-conventions.md)

## 1. 本地运行拓扑

先把运行模式分清楚：

| 模式 | 推荐入口 | 适合什么 |
| --- | --- | --- |
| 日常本地开发 | `just dev`、`just api-dev`、`just web-dev` | 改代码、看热更新、排查局部问题 |
| 本地单机稳定运行 | `just docker-up` | 像生产一样在一台机器上长期跑 |
| 运行态排查 | `just docker-ps`、`just docker-logs`、`just docker-health` | 看容器状态、日志和健康检查 |
| 数据清空 | `just reset-data`、`just reset-dev` | 回到干净本地状态 |

### 本地开发

- 推荐入口：仓库根目录 `just dev`
- 后端本地静态检查入口：仓库根目录 `just api-check`，内部会执行 `ruff check`、`ruff format --check` 和 `basedpyright`
- Web 子命令：`apps/web` 下用 `vp dev`
- API 子命令：`apps/api` 下用 `uv run -m uvicorn ...`
- 如果你要的是“本地像生产一样稳定跑起来”，请直接看下方 Docker Compose 部分，不要继续用 `vp dev` 或 `uvicorn --reload`
- 数据：统一落在仓库根目录 `data/`
- OpenAPI 契约校验当前是严格门禁：`just web-check` / `vp run api:check` 如果发现 `apps/web/openapi/schema.json` 或 `src/lib/api/generated/schema.d.ts` 漂移会直接失败；标准修复入口是 `cd apps/web && vp run api:generate`
- API 启动后默认暴露 `/docs`、`/redoc`、`/openapi.json`；它们与前端契约生成共用同一份 FastAPI OpenAPI 真相源
- 认证当前使用 `PyJWT` 短期 access token + HttpOnly refresh cookie；refresh cookie 默认按请求 scheme 自动决定是否带 `Secure`，若部署在 HTTPS 反向代理后且应用层拿不到 `https` scheme，则需要显式配置 `SESSION_COOKIE_SECURE=true`；本地和容器环境都需要提供稳定的 `JWT_SECRET_KEY`，前端普通请求、资源上传与 SSE 流式聊天都会依赖 `/api/auth/refresh` 恢复 access token
- 浏览器内的布局、虚拟列表、抽屉、附件面板、账户菜单、会话恢复、标题兜底和设置文案收敛，都是纯前端运行时行为；它们不新增环境变量、容器、副进程或本地运维步骤，具体语义统一看 [frontend-workspace.md](./frontend-workspace.md)
- 聊天附件在服务端侧的图片重读、标准化文本拼接、多附件逐个检索后合并等行为，属于 API 运行时输入整形与召回策略；它们同样不新增额外运维动作，具体链路统一看 [runtime-flows.md](./runtime-flows.md)

```mermaid
flowchart LR
  Browser["Browser"]
  Web["vp dev (apps/web)"]
  API["uvicorn (apps/api)"]
  SQLite["data/sqlite"]
  Chroma["data/chroma"]
  Uploads["data/uploads"]
  Normalized["data/normalized"]

  Browser --> Web
  Web --> API
  API --> SQLite
  API --> Chroma
  API --> Uploads
  API --> Normalized
```

### Docker Compose

当前仓库把“本地准生产 / 单机部署”统一收敛到 Docker Compose。它不是额外的可选玩法，而是和开发态并列的正式运行方式。

建议把入口理解成三步：

1. `just init-env`
2. `just docker-check`
3. `just docker-build && just docker-up`（首次启动、改 Dockerfile / lockfile、或改 `VITE_API_BASE_URL` 时）

```mermaid
flowchart LR
  Browser["Browser"]
  Web["web container (nginx)"]
  API["api container (uvicorn)"]
  HostFiles["Host bind mounts"]
  Ollama["Host Ollama (optional)"]

  Browser --> Web
  Web --> API
  API --> HostFiles
  API --> Ollama
```

关键点：

- `web` 是静态站点容器，不跑 `vp preview`
- `api` 容器启动时先执行 migration，再启动 `uvicorn`
- `api` 容器和 `web` 容器都是单机部署态的一部分，不是开发态的替代品
- `api` 启动期除了默认数据 bootstrap，还会补偿残留的 `processing` 文档、`pending / running` chat run，以及 `running` 的索引重建状态
- provider 相关 bootstrap 现在会在单条 `app_settings` 记录里同时种入 `provider_profiles_json`、`response_route_json`、`embedding_route_json`、`vision_route_json`，并把 `pending_embedding_route_json` 初始化为空
- 默认 Ollama bootstrap 当前对齐为 `qwen3.5:4b` 作为 chat / vision 模板值，避免设置页首屏和连接测试看到的默认模型不一致
- API 响应头默认附带 `X-Request-ID`，日志里同样会输出 `request_id`
- SQLite 连接默认开启 `WAL` 和 `busy_timeout=5000`，降低流式事件写入与标准页面读取并发时直接触发锁错误的概率
- 数据目录全部 bind mount 到宿主机，容器重建后数据仍在
- 同名资源如果内容哈希未变化，API 会直接返回当前版本；因此 `data/uploads` 和 `data/normalized` 的增长更接近“真实内容变更”而不是“重复点击上传”
- Linux 场景下通过 `host.docker.internal:host-gateway` 访问宿主机 Ollama

## 2. 运维资产地图

| 文件 | 责任 | 什么时候用 |
| --- | --- | --- |
| `docker-compose.yml` | 定义 `web` / `api` 两个服务、端口、健康检查、bind mount 和日志策略 | 需要看容器拓扑、端口或挂载关系 |
| `scripts/docker-deploy.sh` | 统一封装 Compose 校验、构建、启动、停止、日志、健康检查 | 日常 Docker 启停和排查 |
| `scripts/export_openapi.py` | 导出 FastAPI OpenAPI schema 给前端生成契约类型 | 改 API route / schema 后同步前端契约；`vp run api:check` / `just web-check` 也依赖它做快照校验 |
| `reset-local-data.sh` | 清空本地 SQLite / Chroma / uploads / normalized，并可重跑 migration | 本地需要回到干净状态 |
| `just reset-dev` | 清空本地数据、同步依赖并拉起前后端开发态 | 本地开发状态已经混乱，需要一步回到可运行状态 |
| `just docker-check / build / up / down / restart / ps / logs / health` | 仓库根统一入口 | 日常单机部署、排障和验证 |
| `apps/api/docker-entrypoint.sh` | 容器启动入口：准备目录、迁移数据库、启动 API | 排查容器启动链路 |
| `apps/api/Dockerfile` | 构建 API 运行镜像 | 排查后端镜像构建、依赖缓存 |
| `apps/web/Dockerfile` | 构建前端静态资源镜像 | 排查前端构建、Docker 单机模式下同源 `/api` 固化，以及聊天视口相关前端依赖是否已进入构建产物 |
| `apps/api/.dockerignore` | 收窄后端构建上下文 | Docker 构建过慢或上下文过大 |
| `apps/web/.dockerignore` | 收窄前端构建上下文 | Docker 构建过慢或上下文过大 |

## 3. `docker-compose.yml` 怎么读

### `api` 服务

- 构建上下文：`./apps/api`
- 端口：`${API_PORT:-8000}:8000`
- 环境文件：`${ENV_FILE:-.env}`
- 挂载：
  - `UPLOAD_DIR -> /workspace/data/uploads`
  - `NORMALIZED_DIR -> /workspace/data/normalized`
  - `SQLITE_PATH -> /workspace/data/sqlite/ai_qa.db`
  - `CHROMA_PATH -> /workspace/data/chroma`
- 健康检查：`GET /api/health`
- 运行时日志：结构化输出，便于按 `request_id` 关联请求与后台重建任务

### `web` 服务

- 构建上下文：`./apps/web`
- 构建参数：Docker 单机模式固定为同源 `/api`
- 端口：`${WEB_PORT:-3000}:3000`
- 依赖 `api` 健康后再启动
- 健康检查：`GET /healthz`
- 容器内 `nginx` 会把 `/api/*` 反代到 `api:8000`
- 容器内 `nginx` 同时把 `client_max_body_size` 放宽到 `2g`

### Compose 设计取舍

- 使用 bind mount 而不是 Docker volume，目的是让本地文件和 SQLite 可直接查看
- 日志驱动统一限制大小，避免宿主机被容器日志打满
- Docker 单机模式把 API 收敛到同源 `/api`，优先避免 refresh cookie、SSE 和受保护文件落到跨源链路
- Docker 单机模式下，大文件上传的第一层限制来自 `web` 容器里的 `nginx client_max_body_size`，当前已放宽到 `2g`
- 前端构建期 API 地址仍然是固化值；改了相关构建参数后必须重新 build

## 4. `scripts/docker-deploy.sh` 怎么用

脚本目标不是“少打一行命令”，而是把容易踩坑的校验前置，并把副作用限制在明确的动作里。仓库根目录的 `just docker-*` 只是它的薄封装。

### 它做了什么

- 校验 `docker`、Compose 文件和 `.env`
- 用 `docker compose config --environment` 解析环境变量，而不是直接 `source .env`
- 校验端口、URL 和宿主机路径
- `check` 只做静态校验，不要求 Docker daemon 已启动
- `build / up / down / restart / ps / logs` 这些运行态动作才要求 Docker daemon 可用
- 只有执行 `up` 时才会创建本地目录和 SQLite 文件，`check / build` 不产生运行时副作用

### 常用命令

```bash
just init-env
just docker-check
just docker-build
just docker-up
just docker-ps
just docker-logs api
just docker-health
just docker-down

scripts/docker-deploy.sh check
scripts/docker-deploy.sh build
scripts/docker-deploy.sh up
scripts/docker-deploy.sh ps
scripts/docker-deploy.sh logs api
scripts/docker-deploy.sh health
scripts/docker-deploy.sh down
```

`just docker-up` / `scripts/docker-deploy.sh up` 默认不再强制 `--build`。这样日常拉起或重启现有镜像会更快；如果你改了 Dockerfile、依赖 lockfile，或改了前端构建期 API 地址这类固化值，再显式执行一次 `just docker-build`。

如果你在仓库根目录安装了 `just`，可以用下面这些等价封装从根目录调用对应动作：

```bash
just --list
just dev
just test
just api-dev
just web-dev
just docker-up
just docker-down
just reset-data
just reset-dev
```

### 可覆盖变量

```bash
ENV_FILE=/abs/path/.env scripts/docker-deploy.sh up
COMPOSE_FILE=/abs/path/docker-compose.yml scripts/docker-deploy.sh check
```

## 5. `reset-local-data.sh` 怎么用

这个脚本是本地开发 runbook，不是 Docker 部署脚本。它的目标是“把本地运行态恢复到干净状态”，不是“帮你保留部分历史数据”。

### 它做了什么

- 从 `.env` 或 `ENV_FILE` 读取 `DATA_DIR / UPLOAD_DIR / NORMALIZED_DIR / SQLITE_PATH / CHROMA_PATH`
- `CORS_ALLOW_ORIGINS` 允许用逗号分隔字符串或 JSON 数组配置，便于本地和容器场景共用
- 清空上传目录、标准化目录、Chroma 索引目录
- 删除 SQLite 文件
- 默认重新执行 `uv run python -m alembic upgrade head`
- `just reset-dev` 还会补做 `uv sync --all-groups`、`vp install`，最后拉起前后端开发态脚本

### 安全措施

- 默认要求交互确认；非交互环境必须显式传 `--yes`
- 会打印实际要删除的路径
- 对 `/`、`$HOME`、仓库根目录这类过宽目标直接拒绝执行

### 常用命令

```bash
./reset-local-data.sh
./reset-local-data.sh --yes
ENV_FILE=/abs/path/.env ./reset-local-data.sh --yes
just reset-dev
```

### 适用场景

- 本地测试数据脏了，需要回到干净状态
- 想重跑 migration 和 personal `space` bootstrap
- 调试索引或上传逻辑，需要清空 Chroma 与文件副本

排查测试红线时，优先看用户可见行为、公共契约和关键边界是否回归；不要把 class 名、排版 token 或包装层结构当作长期维护的稳定测试目标。

## 6. 两个 Dockerfile 的职责

### `apps/api/Dockerfile`

- 使用 `uv` 官方 Python 基础镜像做 builder
- 先复制 `pyproject.toml` 和 `uv.lock`，最大化复用依赖缓存
- builder 阶段通过 BuildKit cache mount 复用 `uv` 下载缓存，减少二次构建时间
- 运行时镜像只保留虚拟环境、迁移文件、源码和 entrypoint

### `apps/web/Dockerfile`

- builder 阶段安装固定版本 `vite-plus`
- 先复制 `package.json` 和 lockfile，再安装依赖
- 依赖安装阶段通过 BuildKit cache mount 复用 npm / pnpm 缓存，减少重复下载
- 构建阶段走 `vp run build`，和仓库里的前端生产构建入口保持一致
- build 完后只把 `dist/` 和 `nginx.conf` 带进运行时镜像

## 7. 常见操作手册

### 首次本地 Docker 启动

```bash
just init-env
just docker-build
just docker-up
```

等价脚本：

```bash
cp .env.example .env
scripts/docker-deploy.sh build
scripts/docker-deploy.sh up
```

### 修改了前端构建期 API 地址

```bash
just docker-build
just docker-up
```

等价脚本：

```bash
scripts/docker-deploy.sh build
scripts/docker-deploy.sh up
```

原因：

- Docker 单机模式里，前端会在 build 阶段固化成同源 `/api`，再由 nginx 转发到 `api` 服务

### 只想先校验 Docker 配置

```bash
just init-env
just docker-check
```

等价脚本：

```bash
scripts/docker-deploy.sh check
```

适用场景：

- 先检查 `.env`、端口、URL、路径配置是否合理
- 还没启动 Docker daemon，但想先把静态配置问题挡掉

### API 起不来

1. 先看 `scripts/docker-deploy.sh logs api`
2. 再看 `.env` 路径是否都指向正确宿主机位置
3. 再确认 migration 是否成功执行
4. 再确认宿主机 provider 或 Ollama 地址是否可达
5. 如果 UI 一直显示索引重建中，补查启动期是否已经把残留 `running` 状态补偿成 `failed`
6. 如果要核对接口契约或错误响应声明，直接访问 `/docs`、`/redoc` 或 `/openapi.json`
7. 如果登录后很快就被踢回登录页，补查 `.env` 里的 `JWT_SECRET_KEY / ACCESS_TOKEN_TTL_MINUTES` 是否符合预期，并确认前端是否能成功访问 `/api/auth/refresh`
8. 如果 Docker 单机模式里刚登录后资源上传或图片预览就报 `401`，先确认 `web` 镜像是否已重建，并检查浏览器请求是否仍然直接打到 `http://localhost:8000`，而不是同源 `/api`

### 想彻底重置本地数据

```bash
just reset-data
just reset-dev
```

等价脚本：

```bash
./reset-local-data.sh --yes
```

如果你用的是 Docker，再执行：

```bash
just docker-up
```

## 8. 当前边界

- 当前部署目标是单机或本地环境，不是多机编排
- 没有引入 Redis、Celery、对象存储或外部向量数据库
- 没有额外做镜像签名、SBOM 发布或 Kubernetes 编排
- 这套脚本首先追求“本地可维护、行为可预测”，不是覆盖所有生产平台
