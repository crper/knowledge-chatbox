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
    docker-deploy.sh
    export_openapi.py
  reset-local-data.sh
  README.md
  AGENTS.md
  .env.example
  docker-compose.yml
```

## 2. 目录职责

| 目录                      | 责任                                                                  |
| ------------------------- | --------------------------------------------------------------------- |
| `apps/web`                | React + Vite+ 前端工作台                                              |
| `apps/api`                | FastAPI 后端、SQLite（含 `FTS5` 词法兜底索引）、Chroma、provider 编排 |
| `docs/arch`               | 当前实现的长期架构文档                                                |
| `examples/upload-samples` | 手工验证上传与问答链路的样例文件                                      |
| `data`                    | 本地运行时数据目录，不是代码目录                                      |
| `scripts`                 | Docker 部署和运维脚本                                                 |
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
- `apps/web/src/providers/tanstack-devtools-provider.tsx`

### 3.2 分层约定

| 目录                | 责任                                                              |
| ------------------- | ----------------------------------------------------------------- |
| `routes`            | TanStack Router file-based routes，负责 URL 契约、redirect、guard |
| `router`            | 启动门禁与共享 route shell                                        |
| `pages`             | 路由入口和页面装配                                                |
| `features`          | 业务模块、API 调用、query/mutation 配置、局部状态、页面级编排     |
| `components/ui`     | 基础 UI 组件                                                      |
| `components/shared` | 跨 feature 复用的共享组件                                         |
| `providers`         | Query、i18n、theme、Router 与开发态 Devtools 等顶层 provider      |
| `lib`               | API 客户端、环境变量、hooks、store、utils                         |
| `i18n`              | 多语言文案                                                        |

补充约定：

- `lib/api/generated` 只放 OpenAPI 生成产物和 typed client 入口
- `lib/auth/*` 负责前端会话状态、access token 内存存储和启动恢复编排
- FastAPI app 导出的 OpenAPI 是唯一接口契约源；`/docs`、`/redoc`、`/openapi.json` 与 `scripts/export_openapi.py` 导出的 schema 指向同一份契约
- OpenAPI 生成流程：
  - 后端通过 `scripts/export_openapi.py` 导出 FastAPI OpenAPI schema 到 `apps/web/openapi/schema.json`
  - 前端通过 `openapi-typescript` 从 schema.json 生成 TypeScript 类型到 `src/lib/api/generated/schema.d.ts`
  - 改了 `apps/api` 的 route / schema 后，必须执行 `vp run api:generate` 同步前端契约
  - `vp run api:check` / `just web-check` 会校验 schema 和生成类型是否漂移，失败时需重新执行生成命令
- `lib/api/client.ts` 负责 envelope 解包与前端错误归一化；只统一处理网络失败和 `AbortError`，不要把业务错误或契约错误一律改写成通用 `503`
- `lib/forms.ts` 统一承接轻量表单辅助，包括错误消息抽取和共享 submit event helper；TanStack Form 对话框优先复用这里的轻量能力
- `lib/document-upload.ts` 放聊天区和资源页共用的 document upload workflow helper；它统一承接进度 patch、成功 / 失败收敛，以及 abort signal 透传；资源页上传命中服务端去重时，也在这里统一走“无变化，已跳过上传”的前端反馈
- `lib/auth/auth-redirect.ts` 统一承接 `/login?redirect=...` 的构建、读取和安全归一化；不要再把回跳路径塞回 Zustand
- `features/chat/hooks/use-chat-workspace.ts` 当前只负责聊天页面装配层，组合 read model、runtime controller、cache actions 和 submit / stream 生命周期
- `features/chat/hooks/use-chat-runtime-state.ts` 是 query-backed `streamRun` 的统一读取面
- `features/chat/hooks/use-chat-runtime-controller.ts` 组合会话级提交锁和 `streamRun` action，不承担持久化职责
- `features/chat/hooks/use-chat-session-cache-actions.ts` 统一承接 `messagesWindow / context` 的 patch、started user message 预插入和 targeted invalidate
- `features/chat/store/chat-attachment-store.ts` 只承接会话内待发送附件队列；`features/chat/store/chat-ui-store.ts` 只保留草稿和发送快捷键
- `features/chat/utils/patch-paged-chat-messages.ts` 负责把流式完成 / 失败态优先 patch 进当前已加载消息窗口
- `features/chat/utils/upload-chat-attachments.ts` 负责聊天区待发送附件的有限并发上传与顺序保持
- `features/chat/utils/chat-session-recovery.ts` 负责最近访问聊天会话的本地持久化与恢复决策；`/chat` 入口恢复逻辑优先收敛在这里，不要把同一语义分散到多个路由守卫或页面副作用里，也不要在页面里先落空态再补跳转
- `features/knowledge/route-search.ts` 负责 `/knowledge` 的 route search 契约、query/type/status 归一化和 canonical search path 生成
- `test/render-route.tsx` 负责整页 / 路由契约测试，直接挂真实 TanStack Router route tree
- `test/test-router.tsx` 负责组件级 path / params / search 上下文，不再为测试维护第二套路由实现
- `providers/tanstack-devtools-provider.tsx` 负责开发态 TanStack Devtools 聚合面板；统一收口 Query / Router / Form 调试入口，只在开发环境启用，不进入 Vitest 或生产构建
- `features/knowledge/components/upload-queue-summary.tsx` 负责资源页专用的紧凑上传队列；它不直接复用聊天附件面板，但沿用“标题 + 条目 + 行内操作”的信息结构
- 工作台标准侧栏和会话侧栏骨架优先复用 `components/ui/sidebar`；账户中枢与全局偏好切换优先复用 `components/ui/dropdown-menu`；设置页状态提示优先复用 `components/ui/alert`；会话行辅助动作当前是标题区 + 水平动作 rail，不要再为同语义容器平行造一套业务样式组件
- `components/ui/*` 当前统一基于 `Base UI` 组装；自定义包装组件优先暴露 `render` 而不是 `asChild`；链接样式统一直接复用 `buttonVariants`，不要把 `<a>` 再包进按钮语义里
- `features/*/api` 可以继续做业务封装，但响应 / 请求类型优先从生成契约引用

### 3.3 常见改动入口

| 你要改什么                                   | 先看哪里                                                                                                                                                                                                                                                                       |
| -------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 工作台导航或设置中心结构                     | `src/layouts/app-shell-layout.tsx`、`features/workspace/*`、`features/settings/settings-sections.ts`                                                                                                                                                                           |
| 聊天请求、流式状态、重试、附件展示           | `features/chat/api/*`、`features/chat/hooks/*`、`features/chat/store/*`、`features/chat/components/chat-message-viewport.tsx`、`features/chat/components/attachment-list.tsx`、`features/chat/components/image-viewer-dialog.tsx`、`features/chat/components/message-list.tsx`；如果改的是 runtime 读面、提交锁或 cache patch，优先先看 `use-chat-runtime-state.ts`、`use-chat-runtime-controller.ts`、`use-chat-session-cache-actions.ts` |
| 资源页表格、上传队列、重建索引、重复上传反馈 | `features/knowledge/*`、`components/shared/data-table.tsx`、`features/knowledge/components/upload-queue-summary.tsx`、`lib/document-upload.ts`                                                                                                                                 |
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
| `api/deps.py`                                | 路由共享依赖                                               |
| `core`                                       | 配置、日志、安全基础能力                                   |
| `db`                                         | 引擎和会话工厂                                             |
| `models`                                     | SQLAlchemy 模型                                            |
| `schemas`                                    | 请求/响应模型                                              |
| `repositories`                               | 数据访问                                                   |
| `services`                                   | 用例编排和事务边界                                         |
| `services/chat/workflow`                     | `ChatWorkflow + PydanticAI` 的聊天执行 owner、工具、bridge |
| `providers`                                  | OpenAI / Anthropic / Voyage / Ollama capability adapters   |
| `tasks`                                      | 启动补偿任务                                               |
| `utils`                                      | 文件、哈希、Chroma 等工具                                  |
| `repositories/retrieval_chunk_repository.py` | SQLite `FTS5` 词法候选索引的写入、删除与查询               |

### 4.3 常见改动入口

| 你要改什么                             | 先看哪里                                                                                                     |
| -------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| provider 配置或重建索引语义            | `services/settings/settings_service.py`、`services/documents/rebuild_service.py`、`api/routes/settings.py`   |
| 上传、内容哈希去重、标准化、切块、索引 | `services/documents/*`                                                                                       |
| 聊天、SSE、失败恢复、活跃 run 补偿     | `services/chat/*`、`tasks/document_jobs.py`、`main.py`                                                       |
| `ChatWorkflow` / `PydanticAI` 聊天执行 | `services/chat/workflow/*`、`services/chat/chat_application_service.py`、`services/chat/chat_run_service.py` |
| 认证、会话、用户管理                   | `services/auth/*`、`api/routes/auth.py`、`api/routes/users.py`                                               |
| personal space bootstrap               | `repositories/space_repository.py`、`main.py`                                                                |

## 5. 修改时的基本规则

### 5.1 先改真相源，再改展示层

- 改接口字段，先改 schema / service，再改 route / 前端
- 改状态机或生命周期，先改后端模型和用例，再改前端文案和展示
- 改工作台结构，先改页面和 feature 边界，再补 README 和架构文档
- 改前端错误归一化时，先区分传输层失败和业务 / 契约错误；不要为了“统一提示”把所有异常都压平成 `503`

特别注意：

- 改检索、索引或 provider 语义时，先看 `app_settings` 上的 `embedding_route_json / pending_embedding_route_json / active_index_generation / building_index_generation`，再看 [provider-and-settings.md](./provider-and-settings.md) 和 [runtime-flows.md](./runtime-flows.md)
- 改聊天检索限域时，当前真相是“`services/chat/chat_service.py` 负责组合 `space_id + document_revision_id` 条件；`utils/chroma.py` 负责向量召回；`repositories/retrieval_chunk_repository.py` 负责 SQLite `FTS5` 词法候选兜底”；不要在各调用方自己手拼不同方言，也不要恢复整代索引的全量词法扫描
- 改聊天执行 owner 时，当前真相是“同步和流式问答统一由 `services/chat/workflow/*` 驱动”；不要在 route、repository 或 provider 层再平行塞第二套聊天执行状态机
- 改认证与会话链路时，当前真相是“前端只在内存保存 access token，refresh session 继续走 HttpOnly cookie，`/api/auth/me` 等受保护读取接口在鉴权阶段保持纯读”；不要把 access token 落进 `localStorage`，也不要把 session 心跳重新塞回高频读路径
- 改认证与会话链路时，启动期匿名探测与业务请求续期当前已经分开：前端用 `/api/auth/bootstrap` 处理“是否能恢复已有 refresh session”，匿名态返回 `200 + authenticated=false`；业务请求里的 `401` 续期仍走 `/api/auth/refresh`；更细时序统一看 [auth-and-session-flow.md](./auth-and-session-flow.md)
- 登录回跳当前真相是“受保护页面统一跳 `/login?redirect=...`，登录成功后只读取 URL 里的 redirect 并回到站内路径”；不要再把回跳路径塞进 `session-store`
- 改前端 API 基址或开发态鉴权链路时，当前真相是“浏览器开发态优先走同源 `/api`，由 `apps/web/vite.config.ts` 代理到本机 `8000`；只有显式指向独立后端时，才填 `VITE_API_BASE_URL`”；不要把页面开在 `127.0.0.1:3000`，却把 API 固定到 `http://localhost:8000`
- 改上传与附件链路时，当前真相是“聊天区和资源页共用 document upload helper；前端只持久化附件元数据与作用域提示；后端按文件类型分流：文本文档同步标准化，图片先返回 `processing` 再后台补全；聊天当前轮图片仍直接读取原图”；不要在前端维护第二份附件正文缓存，也不要把上传请求做回 cookie-only 分支
- 改后端上传链路时，当前真相是“`api/routes/documents.py` 先做 `upload-readiness` 校验，再把上传流按块落盘，`VersioningService` 只消费已落盘工件并写入 document/document_revision，重复内容与失败路径的源文件清理由 `IngestionService` 收口”；不要再把整份文件一次性读成 `bytes` 后在 service 层到处传
- 改资源页上传入口时，当前真相是“前端只消费 `GET /api/documents/upload-readiness` 的最小结果，不自行推导 provider 语义，也不复用 `/api/health/capabilities` 做实时探活”；不要在前端维护第二套 provider readiness 规则
- 改聊天 UI 时，附件展示、图片查看、消息视口、失败恢复带、新会话空态、会话恢复和默认标题语义，统一以 [frontend-workspace.md](./frontend-workspace.md) 为准；这里不再平行维护一套页面级视觉规则
- 改聊天数据读取时，当前真相是“主区默认先走 `/api/chat/sessions/{id}/messages?limit=80`，继续向上滚动时再带 `before_id + limit` 请求更早消息；右栏走 `/api/chat/sessions/{id}/context`”；不要再让 `ChatResourcePanel` 或其他 UI 组件直接依赖整段消息列表去反推摘要
- 改流式问答收尾时，当前真相是“Web 优先 patch `messagesWindow` 和 `context`，只有 patch miss 时才回退到对应 query 的失效刷新”；不要把成功或失败收尾重新做回默认整段消息重拉
- 改聊天前端运行时边界时，当前真相是“`useChatRuntimeState` 读 `streamRun`、`useChatRuntimeController` 持有会话级提交锁和 `streamRun` action、`useChatSessionCacheActions` 负责 cache 写入，`useChatWorkspace` 只做装配”；不要再把读 hook、页面 hook 和 cache patch 混回同一个 God hook
- 改聊天 composer 本地状态时，当前真相是“`useChatUiStore` 只持久化草稿和发送快捷键，`useChatAttachmentStore` 单独持有待发送附件”；不要再把 `File` 对象塞回 persist store
- 改资源页或标准工作区壳层时，优先沿用 `WorkspacePage`、`data-table` 和预览抽屉这套共享结构；布局真相同样放在 [frontend-workspace.md](./frontend-workspace.md)
- 改设置页交互时，当前真相是“纯 helper 返回 i18n key，主区承载当前生效配置，高级区只承载检索覆盖、备用模板和 Timeout”；不要在纯逻辑层硬编码中英文文案
- 改 API 文档或前端契约时，当前真相是“FastAPI OpenAPI 为唯一接口契约源”；不要再维护一套平行手写接口文档

### 5.2 小功能不要过度设计

这个仓库的目标是本地优先、易维护的 V1，不是展示复杂抽象能力。优先级一直是：

- 结构清楚
- 行为可预测
- 运行链路稳定

### 5.3 不引入平行真相源

典型例子：

- provider 配置首次可由环境变量 bootstrap，但长期真相源是数据库
- `.env.example` 当前给本地开发主线预置的是 Ollama bootstrap：`response / embedding / vision` 都默认走 Ollama，`INITIAL_OLLAMA_BASE_URL` 默认是 `http://localhost:11434`
- provider 连接信息与 capability route 现在都落在 `app_settings` 的强类型 JSON 字段里；真正的活动能力由 `response_route / embedding_route / vision_route` 决定，embedding 切换中的目标由 `pending_embedding_route` 表示
- 语言、主题、聊天草稿、发送快捷键和按会话隔离的发送中状态属于前端偏好 / UI 协调层；其中主题还会同步到用户账号偏好，但不要混进系统级 provider 配置

## 6. 验证命令

### 6.1 仓库级快捷入口

默认优先在仓库根目录使用 `just`：

```bash
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
just docker-ps
just docker-logs api
just docker-health
```

首次 clone、前端 `pnpm-lock.yaml` 变更，或后端 `uv.lock` 变更后，先按根 `README.md` 执行 `just init-env -> just setup -> just dev`；其中 `just dev` 不负责补装依赖，但会把当前 `API_PORT / WEB_PORT` 透传给共享开发脚本，先拉起 API、等待 `/api/health` ready，再启动 Web，并在终端打印对应访问地址。默认会给 API 一段启动补偿时间，慢机器可通过 `DEV_API_READY_MAX_ATTEMPTS` 放宽等待预算。前端 `vp` 运行时版本当前由 `apps/web/.node-version` 固定到 `24.14.1`，避免每次启动都先依赖远端 `lts` 解析。`just repo-check` 负责校验 README / 包级 README 与 `justfile` 的关键入口约束。如果只是补齐本地数据库 schema、不想直接启动 API，优先在仓库根执行 `just api-migrate`。

当前聊天执行后端已经统一收口到 `services/chat/workflow/*`；本地开发和 Docker 单机模式都直接走这条路径。

只有当你明确需要子项目独立运行时，再进入 `apps/web` 或 `apps/api` 执行细分命令。

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
uv run --group dev python -m pytest
```

- 后端单测优先保护公共契约、边界条件和业务行为；如果同一行为已经被更高层覆盖，不再补简单映射表或静态默认值的重复测试
- `just api-check` 当前等价于 `ruff check + ruff format --check + basedpyright`
- 后端测试目录分层：
  - `tests/integration`: API 路由、provider 集成、文档上传问答全链路测试
  - `tests/unit`: 纯服务、仓储、工具类的单元测试，不依赖外部服务
  - `tests/runtime`: just 命令、脚本、仓库入口的运行时约束测试
  - `tests/migrations`: 数据库迁移的 smoke test，验证 migration 可正确应用到 head
  - `tests/fixtures`: 测试工厂、复用 helper、mock 数据生成器
- 后端 API 集成测试当前统一通过 `apps/api/tests/conftest.py` 的 helper 准备 TestClient、临时 SQLite/Chroma 路径，以及 HTTPS / `SESSION_COOKIE_SECURE` 场景；不要在各测试文件里平行复制同一套启动代码

### 6.4 涉及启动、环境变量或 Docker

```bash
just init-env
just docker-check
just docker-build
just docker-up
just docker-ps
just docker-logs api
just docker-health
scripts/docker-deploy.sh check
scripts/docker-deploy.sh build
```

- Docker 入口默认不再静默复制 `.env`；先执行 `just init-env`
- `just docker-check` / `scripts/docker-deploy.sh check` 只做静态校验，不要求 Docker daemon 已启动
- Docker 单机模式里，`web` 会通过 nginx 把同源 `/api` 反代到 `api` 服务；排查登录刷新、SSE 或受保护文件读取时，优先按同源链路理解
- `just docker-up` 默认复用现有镜像；改 Dockerfile、依赖 lockfile 或前端构建期 API 地址后，先执行 `just docker-build`

### 6.5 涉及本地数据目录

`just reset-dev` 会先执行 `reset-local-data.sh`，再同步依赖并拉起前后端开发态脚本；最终访问地址输出与 `just dev` 保持一致。

如果你只想补齐依赖、不想清空本地数据，使用 `just setup`。

```bash
./reset-local-data.sh --yes
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
