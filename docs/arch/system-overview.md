# 系统总览

这份文档回答三个问题：项目当前解决什么问题、V1 做到哪一步、系统边界怎么落地。具体表结构、设置语义和执行链路分别看配套专题文档。

配套阅读：

- [database-design.md](./database-design.md)
- [auth-and-session-flow.md](./auth-and-session-flow.md)
- [provider-and-settings.md](./provider-and-settings.md)
- [api-surface-and-permissions.md](./api-surface-and-permissions.md)
- [runtime-flows.md](./runtime-flows.md)
- [frontend-workspace.md](./frontend-workspace.md)

## 1. 项目定位

Knowledge Chatbox 是一个本地优先的单机知识工作台，把上传资料、标准化、索引、问答、来源回看、系统配置和用户管理放进同一套工作流。

当前实现强调三件事：

1. 整条链路可运行
2. 结构清楚，方便持续演进
3. 依赖克制，不提前引入重基础设施

运行方式也分得很明确：

- 仓库级首次启动主线以根 `README.md` 为准：`just init-env -> just setup -> just dev`
- 首次 clone 或依赖 lockfile 变更后，先执行 `just setup` 同步后端 `uv` 环境和前端依赖
- 前端 `vp` 工具链当前通过 `apps/web/.node-version` 固定到 `24.14.1`，避免把开发态启动建立在远端 `lts` 版本探测是否可达上
- 日常本地开发在依赖已就绪后走 `just dev`、`just api-dev`、`just web-dev`；其中 `just dev` 会先拉起 API、等待 `/api/health` ready，再启动 Web，并统一打印 Web / API 访问地址；默认会给 API 一段启动补偿时间，慢机器可用 `DEV_API_READY_MAX_ATTEMPTS` 放宽等待预算
- 前端开发态当前会在根层自动挂载 TanStack Devtools 聚合面板，统一查看 Query / Router / Form 状态；这层只在开发环境启用，不进入 Vitest 或生产构建
- 前端开发态默认优先走同源 `/api`：`vp dev` 通过 Vite proxy 把 `/api` 转发到本机 `8000`，避免 `localhost / 127.0.0.1` 混用时把 refresh cookie host 搞乱
- `just reset-dev` 先重置本地数据，再同步依赖并拉起同一套开发态脚本；它和 `just dev` 共用同一份访问地址输出，适合把乱掉的本地状态快速拉回干净可运行态
- 本地单机稳定运行走 `just docker-check / build / up` 这套 Docker Compose 入口；其中 `docker-check` 只做静态校验，`docker-up` 默认复用现有镜像
- Docker 单机模式里，`web` 会通过同源 `/api` 反代到 `api` 服务，避免 refresh cookie、SSE 和受保护文件读取落到跨源链路
- 当前没有额外的 Kubernetes、多机编排或独立生产集群入口
- 后端测试目录当前以 `apps/api/tests/integration`、`apps/api/tests/unit`、`apps/api/tests/runtime`、`apps/api/tests/migrations` 和 `apps/api/tests/fixtures` 为准，不再保留旧的平铺重复目录

当前后端默认质量门禁也已经收敛到一套固定组合：`ruff` 负责格式与基础静态规则，`basedpyright` 负责类型边界，`pytest` 负责行为回归。

在 provider / settings 运行时边界上，当前默认约束也进一步收敛为一条规则：

- `AppSettings` 只作为持久化真相源存在
- provider、聊天和索引链路统一消费强类型 `ProviderRuntimeSettings`
- 业务层不再把 dict-like settings 当作合法运行时输入

在聊天执行边界上，当前也新增了一条统一规则：

- 同步和流式问答都由 `services/chat/workflow/*` 驱动
- 聊天执行 owner 是 `ChatWorkflow + PydanticAI`
- 整条链路继续共享同一套 HTTP 契约、`sources_json` 语义和 `client_request_id` 幂等语义

## 2. V1 边界

### 已落地

| 领域         | 当前能力                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| ------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 认证与权限   | 基于 `PyJWT` 的短期 bearer `access token` + HttpOnly `refresh session`；`admin / user` 两类角色；用户级偏好与账号安全；前端启动期通过 `/api/auth/bootstrap` 尝试恢复 refresh session，匿名态返回 `200 + authenticated=false`，避免把登录页匿名访问表现成错误；业务请求遇到 `401` 时再按单飞策略调用 `/api/auth/refresh` 续期并重放一次；资源上传和 SSE 流式聊天也共用这套续期语义；修改密码弹窗会对“当前密码缺失 / 新密码缺失 / 原始密码错误”展示语义化、可国际化提示；修改密码成功后当前登录状态会立即失效，前端回到登录页要求重新登录 |
| 资源管理     | 上传前置条件、上传、逻辑资源列表、修订历史、删除、重建索引、文件下载                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| 文档处理     | `txt / md / pdf / docx / png / jpg / jpeg / webp` 标准化                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| 问答         | 同步问答、流式问答、来源引用、失败重试、活动 run 查看、长会话虚拟消息视口；主区默认只读取最近一段消息窗口，右栏通过独立会话摘要承接附件与最近一次回答的引用                                                                                                                                                                                                                                                                                                                                                                             |
| 聊天执行后端 | `ChatWorkflow + PydanticAI` 统一驱动同步和流式问答；保持现有 HTTP 契约、`sources_json` 和幂等语义                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| 设置         | OpenAI / Anthropic / Voyage / Ollama profile 与模型模板、`response / embedding / vision` route、系统提示词、连接测试、索引重建状态；前端设置页主区以状态摘要、主配置表单和必要操作入口为主，本地校验与错误反馈按当前语言展示                                                                                                                                                                                                                                                                                                            |
| 前端形态     | 聊天页桌面端固定三栏工作台；资源 / 设置 / 用户页桌面端共享左栏嵌入式、与内容贴边相邻的标准工作区壳层；整体视觉使用 `modern ivory / black obsidian` 的 liquid glass surface；资源页主区采用 `flat + wide` 宽轨道，长资源表格按阈值切到固定表头 + 虚拟行；左下角账户中枢改成整块账户卡菜单，可直切主题 / 语言并跳转偏好设置                                                                                                                                                                                                               |
| 部署         | 本地开发 + Docker Compose 单机部署                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |

### 明确不做

- Redis / Celery / MinIO / Qdrant 这类重基础设施
- 真正多租户级别的复杂权限系统
- 分布式部署和多机编排
- 多检索空间混合召回

## 3. 运行时边界

当前仍是单仓双应用，但运行目标明确是单机、本地优先：

- `apps/web`
  - React + Vite+ + TanStack Router file-based routes
  - 开发态附带 TanStack Devtools 聚合面板，方便查看 Query / Router / Form 运行时状态
  - 负责工作台 UI、资源页、聊天页、设置中心、用户管理，以及前端会话恢复 / 鉴权降级分流
  - URL 契约、legacy redirect、受保护壳层和 canonical settings section 都优先收口在 `src/routes/*`
- `apps/api`
  - FastAPI
  - 负责认证、用户管理、资源入库、索引、检索、问答和系统设置

开发态和部署态的区别是：

- 开发态关注热更新和调试，默认先 `just setup` 一次，再用 `just dev` 或子命令直跑
- 部署态关注单机稳定运行，默认用 Docker Compose，不把 `uvicorn --reload` 或 `vp dev` 当作生产入口

核心存储分层：

- SQLite：业务真相源 + `FTS5` 词法候选兜底索引
- Chroma：chunk / embedding 向量检索派生索引
- 本地目录：原始文件与标准化结果
- FastAPI OpenAPI：接口契约真相源，同时服务 `/docs`、`/redoc`、`/openapi.json` 和前端类型生成

## 4. 当前核心模型

这次重构后，V1 的核心边界已经进一步收敛：

- 每个用户只有一个 personal `space`
- 文档采用 `documents + document_revisions`
- Chroma 只保存可重建的向量检索派生数据
- SQLite 同库维护 `FTS5` 词法候选兜底索引；它是派生数据，不是业务真相源
- provider 设置采用 `app_settings` 单表承载的强类型 JSON 字段：`provider_profiles + response / embedding / pending_embedding / vision route`

这意味着：

- 不再存在 `workspace -> knowledge_base` 挂载层
- 资源列表返回逻辑 document 视角，并内嵌 `latest_revision`
- 文档修订历史单独走 `/api/documents/{document_id}/revisions`
- 聊天附件归档与发送都围绕 `document_revision_id`

## 5. 两条主链路

### 资源上传

1. 在当前用户 personal `space` 下创建或复用 `documents`
2. 资源页会先读取 `upload-readiness`，若当前检索链路缺少最小配置，前端直接禁用上传入口
3. 上传接口在真正落盘前再次校验同一套 readiness 规则，避免旧前端或直调 API 绕过门禁
4. 上传内容先按块落到本地 `uploads` 目录，并同步计算 `content_hash + file_size`
5. 追加 `document_revisions`
6. 文本文档（`txt / md / pdf / docx`）在请求内完成标准化与索引
7. 图片文档（`png / jpg / jpeg / webp`）先返回 `processing`，随后由后台任务补做 vision 标准化与索引
8. 成功后把 latest revision 指针移动到新修订

关键约束：

- 同名且内容哈希未变时直接返回当前修订
- 命中重复内容时，会清理本次新落盘的源文件，不额外保留第二份重复副本
- 活动 `embedding_route` 缺配置时，新上传会直接返回 `409 embedding_not_configured`
- 索引重建中若 `pending_embedding_route` 缺配置，新上传会直接返回 `409 pending_embedding_not_configured`
- 失败时回滚数据库状态并清理本次文件与索引副作用
- 图片后台补全过程若中断，API 启动期会优先尝试恢复；无法恢复时再标记为 `failed`
- 若系统正在切换 embedding route，新文档会同时写入 `active` 与 `building` generation
- `vision_route` 缺配置不会阻断图片上传；图片会退化成基础文件信息入库
- 资源重建会区分“文档不存在”和“文档尚未标准化”：缺失资源返回 `404 document_not_found`，未完成标准化返回 `409 document_not_normalized`
- 上传链路出现未知内部异常时，对外固定返回 `500 document_upload_failed`，日志保留原始异常，但接口不直接外泄内部错误文案

### 聊天问答

1. 会话先确定当前用户 personal `space` 检索范围；若本轮消息带附件，再优先收窄到当前附件对应文档修订
2. 非寒暄且存在可检索内容时才做 retrieval
3. 流式问答把运行态拆成 `chat_runs + chat_run_events + chat_messages`
4. 相同 `client_request_id` 命中时复用既有 run 并重放事件
5. 聊天执行 owner 当前统一由 `services/chat/workflow/*` 驱动同步和流式执行

关键约束：

- 当前对外只有一个活动检索空间，但内部允许存在一个正在构建的 generation
- 小聊、寒暄、致谢类短句默认不走 retrieval，也不会展示来源引用
- 本轮消息若带文档附件，response 链路会优先读取当前轮附件的标准化文本片段并带进上下文；retrieval 也会优先限域到这些附件对应的 `document_revision_id`
- 当前轮图片附件会在 provider 调用前直接重读原图、转成稳定 JPEG，并作为多模态 user content 注入 `ChatWorkflow`；不会再把“是否读取图片附件”交给模型先调工具决定
- 多文档附件当前会先按附件集合做一次批量限域召回，再按 `document_revision_id` 在内存里做轮转式公平选取，避免单个文档吃满全局 `top_k`，也避免附件数增多时把检索请求线性放大
- 当 `space_id` 与 `document_revision_id` 两类限域条件同时存在时，后端会先把它们归一化成 Chroma 兼容的复合 `where` 表达式；内存 store 与持久化 store 共享同一套过滤语义
- 纯图片附件且只有泛化看图问法时同样默认跳过 retrieval，直接交给视觉分析
- 图片附件在真正发给 response provider 前，会从已持久化的 `document_revision` 重新读取原图并统一转成稳定的 JPEG payload，再直接作为多模态输入进入模型，避免 provider 因原始格式差异、文件名异常，或工作流只传附件元数据而漏掉真实图片内容
- `ChatWorkflow + PydanticAI` 当前按“两条输出链路”接入：同步问答走结构化输出，流式问答走文本流式输出并通过工具结果收集 `sources_json`，目的是保留现有 SSE 体验
- Chroma 查询优先使用 query embedding；向量命中不足或 query embedding 生成失败时，再退回 SQLite `FTS5` 词法候选检索并做轻量重排；不会退回整代索引的全量词法扫描；弱命中不会注入 prompt，也不会返回 `sources_json`
- 切换检索 provider 或检索 embedding model 后，会进入“保存设置 -> 启动后台重建 -> 成功后切换 active generation”的流程
- 会话级 `reasoning_mode` 当前会作用在 response provider；流式问答会把实际生效值写入 `chat_runs`
- 同一会话下重复发送相同 `client_request_id` 的流式请求时，后端会复用既有 `chat_run` 并重放已持久化事件，不再生成重复 assistant 消息
- Web 主区默认通过 `/api/chat/sessions/{id}/messages?limit=80` 只读取最近一段消息窗口；继续向上滚动时再通过 `before_id + limit` 请求更早消息；不带参数的 `/messages` 仍保留作兼容路径
- Web 右侧上下文栏当前走 `/api/chat/sessions/{id}/context`，返回当前会话已去重附件摘要和最近一次 assistant 引用，不再通过整段消息列表在前端反推
- 资源页在筛选命中“看不到正在处理中的文档”时，前端不会再补拉第二份完整文档列表，而是改读轻量 `summary` 摘要来判断是否仍需继续刷新当前筛选列表
- 受保护读取接口在鉴权阶段保持纯读，不再为 session 心跳同步写 `auth_sessions.last_seen_at`；避免长时间流式回答持有 SQLite 写事务时，把 `/api/auth/me`、`/api/settings` 这类标准工作区读取请求锁成 `500`
- 流式 assistant projection 和 `chat_run_events` 当前按短批次提交，避免整段回答长期持有 SQLite 写事务，把会话改名、新建会话等并发写操作一起拖住
- Web 侧流式完成或失败时，当前会优先 patch 已加载的消息窗口和会话摘要；只有 patch miss 时才回退到对应 query 的失效刷新，而不是默认把整段会话重拉一遍
- SQLite 连接层默认开启 `WAL` 和 `busy_timeout=30000`，进一步降低流式事件写入与标准读取并发时直接触发锁错误的概率
- 认证类失败、图片处理失败和用户管理里的“资源缺失”都优先收敛成稳定业务语义；前端是否如何展示，统一看 [frontend-workspace.md](./frontend-workspace.md) 和 [api-surface-and-permissions.md](./api-surface-and-permissions.md)
- 前端工作台里的会话恢复、默认标题、长会话视口、资源页宽轨道与预览抽屉等交互，统一看 [frontend-workspace.md](./frontend-workspace.md)；这里不再重复页面级展示细节

## 6. 前端边界

- 前端保持“聊天三栏工作区 + 标准工作区两栏壳层”的结构
- 聊天区与资源区都已经围绕长会话、宽表格和按需预览做了稳定收口
- 具体页面语义、状态边界和交互约束统一看 [frontend-workspace.md](./frontend-workspace.md)

## 7. 建议的阅读顺序

1. 看 [README.md](../../README.md)
2. 看 [CONTRIBUTING.md](../../CONTRIBUTING.md)
3. 看 [repo-map-and-conventions.md](./repo-map-and-conventions.md)
4. 看 [database-design.md](./database-design.md)
5. 看 [provider-and-settings.md](./provider-and-settings.md)
6. 再按需要进入具体实现文件
