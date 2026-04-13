# 仓库地图与约定

这份文档是接手代码时的最快导航图，用来快速定位目录职责、常见入口和提交前的验证命令。它不记录某次任务怎么一步步完成，而是长期说明：

- 仓库里每个目录负责什么
- 常见改动应该从哪里开始
- 提交前至少跑哪些命令
- 文档什么时候必须同步更新

仓库级首次启动主线以根 `README.md` 为准：`just init-env -> just setup -> just dev`。这份文档只记录长期约定和导航，不再平行维护第二套 onboarding。

配套阅读：

- [system-overview.md](./system-overview.md)
- [frontend-workspace.md](./frontend-workspace.md)
- [deployment-and-operations.md](./deployment-and-operations.md)

## 1. 根目录地图

```text
knowledge-chatbox/
  .github/
  apps/
    web/
    api/
  docs/
    arch/
  examples/
    upload-samples/
  data/
    uploads/
    normalized/
    chroma/
    sqlite/
  scripts/
    api-entrypoint.sh
    check_repo_surface.py
    dev-run.sh
    docker-deploy.sh
    export_openapi.py
    reset-local-data.sh
    lib/
  README.md
  AGENTS.md
  .env.example
  docker-compose.yml
```

## 2. 目录职责

| 目录                      | 责任                                                                  |
| ------------------------- | --------------------------------------------------------------------- |
| `apps/web`                | React + Vite+ 前端工作台                                              |
| `apps/api`                | FastAPI 后端、SQLite（含 `FTS5` 词法候选兜底索引）、Chroma、provider 编排 |
| `.github`                 | GitHub Actions CI、Dependabot 更新策略与自动合并工作流                |
| `docs/arch`               | 当前实现的长期架构文档                                                |
| `examples/upload-samples` | 手工验证上传与问答链路的样例文件                                      |
| `data`                    | 本地运行时数据目录，不是代码目录                                      |
| `scripts`                 | 仓库级运行、部署与维护脚本（含 `lib/` 共享 Bash 模块）                |
| `apps/web/openapi`        | 前端消费的 OpenAPI schema 快照                                        |

## 3. 前端代码地图

### 3.1 核心入口

- `apps/web/src/main.tsx`
- `apps/web/src/app.tsx`
- `apps/web/src/tanstack-router.tsx`
- `apps/web/src/routes/*`
- `apps/web/src/router/bootstrap-gate.tsx`
- `apps/web/src/router/route-shells.tsx`
- `apps/web/src/layouts/app-shell-layout.tsx`
- `apps/web/src/layouts/workbench-layout.tsx`
- `apps/web/src/features/workspace/components/workspace-rail.tsx`
- `apps/web/src/providers/tanstack-devtools-provider.tsx`

### 3.2 分层约定

| 目录                | 责任                                                              |
| ------------------- | ----------------------------------------------------------------- |
| `routes`            | TanStack Router file-based routes，负责 URL 契约、redirect、guard |
| `router`            | 启动门禁与共享 route shell                                        |
| `pages`             | 路由入口和页面装配                                                |
| `features`          | 业务模块、API 调用、query/mutation 配置、局部状态、页面级编排     |
| `components/ui`     | 基础 UI 组件（统一基于 Base UI 组装，优先暴露 `render`）         |
| `components/shared` | 跨 feature 复用的共享组件                                         |
| `components/upload` | 跨 feature 复用的上传拖放区组件                                   |
| `providers`         | Query、i18n、theme、Router 与开发态 Devtools 等顶层 provider      |
| `lib`               | API 客户端、环境变量、hooks、store、utils（见下方细分）           |
| `i18n`              | 多语言文案                                                        |

`lib/` 细分：

| 子目录/文件            | 责任                                                |
| ---------------------- | --------------------------------------------------- |
| `lib/api`              | 生成契约、typed client 入口、envelope 解包、错误归一化、认证 fetch 封装、受保护文件读取、query keys |
| `lib/api/generated`    | OpenAPI 生成的契约类型和 typed client 入口          |
| `lib/auth`             | 前端会话状态、access token 内存存储和启动恢复编排   |
| `lib/config`           | 环境变量、常量、主题同步存储                        |
| `lib/form`             | TanStack Form 对话框共享组件（form-feedback、use-app-form） |
| `lib/hooks`            | 通用 hooks（如 use-mobile）                         |
| `lib/store`            | 全局 UI store（language、theme）                    |
| `lib/validation`       | 表单校验适配器和 schema                             |
| `lib/dom`              | DOM 工具                                            |
| `lib/forms.ts`         | 轻量表单辅助（错误消息抽取、submit event helper）   |
| `lib/document-upload.ts` | 聊天区和资源页共用的上传 workflow helper           |
| `lib/date-utils.ts`    | 日期格式化工具                                      |
| `lib/provider-display.ts` | Provider 展示名称/图标映射                        |
| `lib/routes.ts`        | 路由工具                                            |
| `lib/utils.ts`         | 通用工具函数（cn、getErrorMessage、formatFileSize） |

补充约定：

- `lib/api/generated` 只放 OpenAPI 生成产物和 typed client 入口
- FastAPI app 导出的 OpenAPI 是唯一接口契约源；改了 `apps/api` 的 route / schema 后，必须执行 `vp run api:generate` 同步前端契约
- `apps/web/openapi/schema.json` 与 `apps/web/src/lib/api/generated/schema.d.ts` 当前是本地生成产物，不再纳入版本控制；官方入口会在缺失时自动生成、存在时再校验漂移
- `vp run api:check` / `just web-check` 会校验 schema 和生成类型是否漂移
- `lib/api/client.ts` 负责 envelope 解包与前端错误归一化；只统一处理网络失败和 `AbortError`，不要把业务错误或契约错误一律改写成通用 `503`
- `lib/forms.ts` 统一承接轻量表单辅助，包括错误消息抽取和共享 submit event helper
- `lib/document-upload.ts` 放聊天区和资源页共用的 document upload workflow helper
- `lib/auth/auth-redirect.ts` 统一承接 `/login?redirect=...` 的构建、读取和安全归一化
- `components/ui/*` 统一基于 Base UI 组装；自定义包装组件优先暴露 `render` 而不是 `asChild`；链接样式统一直接复用 `buttonVariants`
- `features/*/api` 可以继续做业务封装，但响应 / 请求类型优先从生成契约引用

### 3.3 常见改动入口

| 你要改什么                                   | 先看哪里                                                                                                                                                                                                                                                                       |
| -------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 工作台导航或设置中心结构                     | `src/layouts/app-shell-layout.tsx`、`src/layouts/app-shell-layout-shells.tsx`、`src/layouts/workbench-layout.tsx`、`features/workspace/*`、`features/settings/settings-sections.ts`                                                                                             |
| 聊天请求、流式状态、重试、附件展示           | `features/chat/api/*`、`features/chat/hooks/*`、`features/chat/store/*`、`features/chat/components/chat-message-viewport.tsx`、`features/chat/components/attachment-list.tsx`、`features/chat/components/image-viewer-dialog.tsx`、`features/chat/components/message-list.tsx` |
| 资源页表格、上传队列、PDF 预览、重建索引、重复上传反馈 | `features/knowledge/*`、`features/knowledge/components/document-pdf-preview.tsx`、`components/shared/data-table.tsx`、`features/knowledge/components/upload-queue-summary.tsx`、`lib/document-upload.ts`                                                                                                                                 |
| 当前用户、登录、改密、主题偏好               | `features/auth/*`、`lib/auth/*`、`router/*`、`features/workspace/components/workspace-account-menu.tsx`                                                                                                                                                                        |
| 页面表单校验与提交流程                       | 对应 `features/*/components/*form*`，默认先看 TanStack Form 用法；共享 submit / 错误抽取先看 `lib/forms.ts`                                                                                                                                                                    |

## 4. 后端代码地图

### 4.1 核心入口

- `apps/api/src/knowledge_chatbox_api/main.py`
- `apps/api/src/knowledge_chatbox_api/api/routes/*`
- `apps/api/src/knowledge_chatbox_api/services/*`

### 4.2 分层约定

| 目录                                         | 责任                                                       |
| -------------------------------------------- | ---------------------------------------------------------- |
| `api/routes`                                 | HTTP 入口                                                  |
| `api/deps.py`                                | 路由共享依赖，复用 `core/service_builders.py` 装配 service |
| `core`                                       | 配置、日志、安全基础能力，以及共享 service builder         |
| `db`                                         | 引擎和会话工厂                                             |
| `models`                                     | SQLAlchemy 模型                                            |
| `schemas`                                    | 请求/响应模型                                              |
| `repositories`                               | 数据访问                                                   |
| `services`                                   | 用例编排和事务边界                                         |
| `services/chat/workflow`                     | `ChatWorkflow + PydanticAI` 的聊天执行 owner、工具、bridge |
| `services/chat/retrieval`                    | 检索策略、上下文构建、查询归一化                           |
| `services/chat/retrieval_service.py`         | 检索执行封装                                               |
| `services/chat/prompt_attachment_service.py` | 附件物化（文档标准化文本 + 图片 JPEG 转换）                |
| `services/chat/chat_stream_presenter.py`     | SSE 流式事件呈现                                           |
| `services/chat/retry_service.py`             | 聊天重试逻辑                                               |
| `services/chat/chat_persistence_service.py`  | 聊天运行持久化（run / event 写入与查询）                   |
| `providers`                                  | OpenAI / Anthropic / Voyage / Ollama capability adapters；API 调用通过 `tenacity` 自动重试 |
| `tasks`                                      | 启动补偿任务                                               |
| `utils`                                      | 文件、哈希、Chroma 等工具                                  |
| `repositories/retrieval_chunk_repository.py` | SQLite `FTS5` 词法候选兜底索引的写入、删除与查询           |

### 4.3 常见改动入口

| 你要改什么                             | 先看哪里                                                                                                     |
| -------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| provider 配置或重建索引语义            | `services/settings/settings_service.py`、`services/documents/rebuild_service.py`、`api/routes/settings.py`   |
| 上传、内容哈希去重、标准化、切块、索引 | `services/documents/*`                                                                                       |
| 聊天、SSE、失败恢复、活跃 run 补偿     | `services/chat/*`、`tasks/document_jobs.py`、`main.py`                                                       |
| `ChatWorkflow` / `PydanticAI` 聊天执行 | `services/chat/workflow/*`、`services/chat/chat_application_service.py`、`services/chat/chat_run_service.py` |
| 认证、会话、用户管理                   | `services/auth/*`、`core/service_builders.py`、`repositories/rate_limit_repository.py`、`api/routes/auth.py`、`api/routes/users.py`     |
| personal space bootstrap               | `repositories/space_repository.py`、`main.py`                                                                |

## 5. 修改时的基本规则

### 5.1 先改真相源，再改展示层

- 改接口字段，先改 schema / service，再改 route / 前端
- 改状态机或生命周期，先改后端模型和用例，再改前端文案和展示
- 改工作台结构，先改页面和 feature 边界，再补 README 和架构文档
- 改前端错误归一化时，先区分传输层失败和业务 / 契约错误；不要为了"统一提示"把所有异常都压平成 `503`

### 5.2 关键导航表

改以下领域时，先看对应权威文档和核心文件：

| 改动领域         | 权威文档                                                               | 核心文件                                                                                                        |
| ---------------- | ---------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| 检索 / 索引 / provider | [provider-and-settings.md](./provider-and-settings.md)、[runtime-flows.md](./runtime-flows.md) | `app_settings` 上的 route 字段、`settings_versions` 审计快照、`services/chat/retrieval/policy.py`、`repositories/retrieval_chunk_repository.py` |
| 聊天检索限域     | [runtime-flows.md](./runtime-flows.md)                                 | `services/chat/retrieval/policy.py`（组合 `space_id + document_revision_id`）、`services/chat/retrieval_service.py` |
| 聊天执行 owner   | [runtime-flows.md](./runtime-flows.md)                                 | `services/chat/workflow/*`；不要在 route / repository / provider 层再平行塞第二套聊天执行状态机                  |
| 认证与会话       | [auth-and-session-flow.md](./auth-and-session-flow.md)                 | 前端 access token 只存内存、refresh session 走 HttpOnly cookie、受保护读取接口鉴权阶段保持纯读                  |
| 登录回跳         | [auth-and-session-flow.md](./auth-and-session-flow.md)                 | 统一走 `/login?redirect=...`，不要把回跳路径塞进 `session-store`                                                |
| 前端 API 基址    | [deployment-and-operations.md](./deployment-and-operations.md)         | 开发态优先走同源 `/api`，由 Vite proxy 转发；不要混用 `localhost / 127.0.0.1`                                   |
| 上传与附件       | [runtime-flows.md](./runtime-flows.md)                                 | 聊天区和资源页共用 `lib/document-upload.ts`；后端按文件类型分流                                                  |
| 后端上传链路     | [api-surface-and-permissions.md](./api-surface-and-permissions.md)     | `api/routes/documents.py` 先做 readiness 校验再落盘；`IngestionService` 收口重复内容与失败路径清理              |
| 资源页上传入口   | [provider-and-settings.md](./provider-and-settings.md)                 | 前端只消费 `upload-readiness`，不自行推导 provider 语义                                                         |
| 聊天 UI          | [frontend-workspace.md](./frontend-workspace.md)                       | 附件展示、消息视口、失败恢复、会话恢复、默认标题等页面级交互                                                    |
| 聊天数据读取     | [frontend-workspace.md](./frontend-workspace.md)                       | 主区走 `/messages?limit=80`、右栏走 `/context`；不要让 UI 组件依赖整段消息列表反推摘要                          |
| 流式问答收尾     | [frontend-workspace.md](./frontend-workspace.md)                       | 优先 patch `messagesWindow` 和 `context`，patch miss 时才回退到 query 失效刷新                                  |
| 聊天前端运行时   | [frontend-workspace.md](./frontend-workspace.md)                       | `useChatRuntime` 是运行态读写 owner，`useChatCacheWriter` 是 Query cache 唯一写出口，`useChatComposerStore` 是 composer 唯一 owner |
| 聊天 composer    | [frontend-workspace.md](./frontend-workspace.md)                       | `useChatComposerStore` 是唯一 owner；只持久化草稿和快捷键，附件继续保留内存态；不要把 `File` 对象塞回 persist store |
| 设置页交互       | [provider-and-settings.md](./provider-and-settings.md)                 | 纯 helper 返回 i18n key，主区承载当前生效配置，高级区承载检索覆盖和备用模板                                     |
| API 文档 / 契约  | —                                                                      | FastAPI OpenAPI 为唯一接口契约源；不要维护平行手写接口文档                                                      |

### 5.3 小功能不要过度设计

这个仓库的目标是本地优先、易维护的 V1，不是展示复杂抽象能力。优先级一直是：

- 结构清楚
- 行为可预测
- 运行链路稳定

### 5.4 不引入平行真相源

典型例子：

- provider 配置首次可由环境变量 bootstrap，但长期真相源是数据库
- provider 连接信息与 capability route 现在都落在 `app_settings` 的强类型 JSON 字段里；真正的活动能力由 `response_route / embedding_route / vision_route` 决定，embedding 切换中的目标由 `pending_embedding_route` 表示
- 语言、主题、聊天草稿、发送快捷键和按会话隔离的发送中状态属于前端偏好 / UI 协调层；其中主题还会同步到用户账号偏好，但不要混进系统级 provider 配置

## 6. 验证命令

### 6.1 仓库级快捷入口

默认优先在仓库根目录使用 `just`：

```bash
just
just help
just init-env
just setup
just --list
just api-migrate
just dev
just repo-check
just test
just api-dev
just web-dev
just reset-dev
just docker-up
just docker-down
just docker-check
just docker-build
just docker-restart
just docker-ps
just docker-logs api
just docker-health
```

首次 clone 或依赖 lockfile 变更后，先按根 `README.md` 执行 `just init-env -> just setup -> just dev`。启动行为细节详见 [deployment-and-operations.md](./deployment-and-operations.md)。

只有当你明确需要子项目独立运行时，再进入 `apps/web` 或 `apps/api` 执行细分命令。

补充约定：

- `just` / `just help` 只展示精简过的高频入口，降低日常记忆负担
- `just --list` 保留完整命令面，适合排查或查找低频入口
- `just init-env` 负责补齐空白的本地密钥，并提示你去 `.env` 查看 bootstrap 管理员密码
- `scripts/dev-run.sh` 在 `just dev` / `just reset-dev` 启动时会先预检 `API_PORT / WEB_PORT` 是否空闲；若端口已占用，会直接失败并提示改端口或停掉旧进程
- `scripts/dev-run.sh` 在 `just dev` / `just reset-dev` 启动时会打印 bootstrap 管理员账号和密码来源，避免重置数据后还沿用旧默认密码
- `.github/workflows/ci.yml` 当前把仓库门禁收敛为 `api / web / repo-surface` 三个 job
- `.github/workflows/dependabot-auto-merge.yml` 只会处理 Dependabot 发起的 `patch / minor` 更新；`major` 更新不会自动合并
- `web` job 会注入一次性的 `JWT_SECRET_KEY / INITIAL_ADMIN_PASSWORD`，仅用于 OpenAPI 导出与契约校验，不作为运行时真相源
- `web` job 在安装依赖后强制走项目本地 `./node_modules/.bin/vp`，避免 CI 误用全局 `vite-plus` 导致测试环境缺少 `jsdom`
- `api` job 当前先阻塞 `ruff + pytest`；`basedpyright` 继续作为本地 `just api-check` 的一部分，等类型基线清理完成后再考虑恢复为 blocking step

### 6.2 前端

```bash
cd apps/web
vp run api:generate
vp check --fix
vp test
vp build
```

- 改了 `apps/api` 的 route / schema 后，先执行 `vp run api:generate`
- 仓库根的 `just web-check` / `just web-build` 已经内置 `vp run api:check`
- 前端单测优先写用户可见行为和稳定契约，不维护 class 名、排版 token、DOM 包装层这类实现细节镜像测试

### 6.3 后端

```bash
cd apps/api
uv run ruff check
uv run ruff format --check
uv run basedpyright
uv run basedpyright --project pyproject.test.toml
uv run --group dev python -m pytest
```

- 后端解释器真相源是 `apps/api/.python-version`，当前固定 `3.13.13`；本地补环境或 CI 配置时，不要再手写一套独立 Python 版本
- 后端单测优先保护公共契约、边界条件和业务行为；如果同一行为已经被更高层覆盖，不再补简单映射表或静态默认值的重复测试
- `just api-check` 当前等价于 `ruff check + ruff format --check + basedpyright（src） + basedpyright --project pyproject.test.toml（tests）`
- 后端测试目录分层：
  - `tests/integration`: API 路由、provider 集成、文档上传问答全链路测试
  - `tests/unit`: 纯服务、仓储、工具类的单元测试，不依赖外部服务
  - `tests/runtime`: just 命令、脚本、仓库入口的运行时约束测试
  - `tests/migrations`: 数据库迁移的 smoke test
  - `tests/fixtures`: 测试工厂、复用 helper、mock 数据生成器
- 后端 API 集成测试统一通过 `apps/api/tests/conftest.py` 暴露 fixture；运行时环境拼装、临时 SQLite/Chroma 路径准备和 `TestClient` 构造收口在 `apps/api/tests/fixtures/runtime.py`
- 原生异步测试统一使用 `pytest-asyncio`，`apps/api/pyproject.toml` 开启 `asyncio_mode = "auto"`；不要再在新测试里手写 `asyncio.run(...)` 包装异步断言

### 6.4 涉及启动、环境变量或 Docker

```bash
just init-env
just docker-check
just docker-build
just docker-up
just docker-restart
just docker-ps
just docker-logs api
just docker-health
scripts/docker-deploy.sh check
scripts/docker-deploy.sh build
```

- Docker 入口默认不再静默复制 `.env`；先执行 `just init-env`
- `just docker-check` / `scripts/docker-deploy.sh check` 只做静态校验，不要求 Docker daemon 已启动
- Docker 单机模式里，`web` 会通过 nginx 把同源 `/api` 反代到 `api` 服务
- `just docker-up` 会在启动前重建当前镜像，优先保证容器内前后端产物与工作区一致；`just docker-build` 主要用于单独预热镜像或排查构建失败

### 6.5 涉及本地数据目录

`just reset-dev` 会先执行开发端口预检；只有预检通过后，才会执行 `scripts/reset-local-data.sh`、同步依赖并拉起前后端开发态脚本。

如果你只想补齐依赖、不想清空本地数据，使用 `just setup`。

```bash
./scripts/reset-local-data.sh --yes
just setup
just reset-dev
```

## 7. 文档同步规则

以下类型改动不能只改代码，不改文档：

- 运行命令
- 环境变量
- 目录结构
- provider 语义
- 权限边界
- Docker / 本地运维脚本
- 工作台一级信息架构

至少要同步检查：

- 根 `README.md`
- `docs/arch/system-overview.md`
- `docs/arch/repo-map-and-conventions.md`
- `docs/arch/deployment-and-operations.md`

若变更涉及 provider 或设置中心，还要同步：

- `docs/arch/provider-and-settings.md`
- `docs/arch/frontend-workspace.md`
- `apps/web/README.md`

若变更涉及索引代际、`pending_embedding_route` 或重建状态，还要同步：

- `docs/arch/provider-and-settings.md`
- `docs/arch/runtime-flows.md`
- `docs/arch/database-design.md`

## 8. 推荐读代码顺序

### 第一次接手仓库

1. `README.md`
2. `CONTRIBUTING.md`
3. `docs/arch/system-overview.md`
4. `docs/arch/repo-map-and-conventions.md`

### 先改前端

1. `apps/web/README.md`
2. `docs/arch/frontend-workspace.md`
3. `apps/web/src/routes/*`

### 先改后端

1. `apps/api/README.md`
2. `docs/arch/api-surface-and-permissions.md`
3. `apps/api/src/knowledge_chatbox_api/main.py`
