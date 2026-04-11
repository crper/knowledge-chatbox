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

当前实现强调三件事：整条链路可运行、结构清楚方便持续演进、依赖克制不提前引入重基础设施。

### 运行方式

启动与部署细节详见 [deployment-and-operations.md](./deployment-and-operations.md)，这里只列核心入口：

- `just` / `just help` 默认打印精简后的高频入口，`just --list` 查看完整命令面
- 首次启动：`just init-env -> just setup -> just dev`
- 日常开发：`just dev` / `just api-dev` / `just web-dev`
- 单机部署：`just docker-up`
- 数据重置：`just reset-dev`

补充约束：

- `just init-env` 会自动补齐本地开发所需的 `JWT_SECRET_KEY` 和 `INITIAL_ADMIN_PASSWORD`
- `just dev` / `just reset-dev` 启动时会提示 bootstrap 管理员账号，并明确告诉你登录密码应回看 `.env`

### 收敛规则

- **设置真相源**：`AppSettings` 是持久化真相源；运行时统一消费强类型 `ProviderRuntimeSettings`，不再接受 dict-like 输入
- **聊天执行**：同步和流式问答统一由 `ChatWorkflow + PydanticAI` 驱动，共享 HTTP 契约、`sources_json` 和 `client_request_id` 幂等语义
- **质量门禁**：`ruff`（格式与静态规则）+ `basedpyright`（类型边界）+ `pytest`（行为回归）

## 2. V1 边界

### 已落地

**认证与权限**

- 基于 `PyJWT` 的短期 bearer `access token` + HttpOnly `refresh session`；`admin / user` 两类角色
- 启动期通过 `/api/auth/bootstrap` 恢复 refresh session，匿名态返回 `200 + authenticated=false`
- 业务请求 `401` 时按单飞策略调用 `/api/auth/refresh` 续期并重放一次
- 修改密码成功后当前登录状态立即失效，前端回到登录页要求重新登录
- 详细时序与接口分工见 [auth-and-session-flow.md](./auth-and-session-flow.md)

**资源管理**

- 上传前置条件、上传、逻辑资源列表、修订历史、删除、重建索引、文件下载

**文档处理**

- `txt / md / pdf / docx / png / jpg / jpeg / webp` 标准化；切块使用 chonkie Markdown 感知递归策略

**问答**

- 同步问答、流式问答、来源引用、失败重试、活动 run 查看、长会话虚拟消息视口
- 主区默认只读取最近一段消息窗口，右栏通过独立会话摘要承接附件与最近一次回答的引用

**聊天执行**

- `ChatWorkflow + PydanticAI` 统一驱动同步和流式问答；Provider 层 API 调用通过 `tenacity` 自动重试
- 详细执行链路见 [runtime-flows.md](./runtime-flows.md)

**设置**

- OpenAI / Anthropic / Voyage / Ollama profile 与模型模板、`response / embedding / vision` route、系统提示词、连接测试、索引重建状态
- 详细设置语义见 [provider-and-settings.md](./provider-and-settings.md)

**前端形态**

- 桌面端统一一级 `WorkspaceRail`；`/chat` 固定三栏、`/knowledge` 三栏工作台、`/graph` 占位、`/settings` 与 `/users` 内容页壳层
- 资源页主区采用 `flat + wide` 宽轨道，长表格按阈值切到固定表头 + 虚拟行
- 左下角账户中枢可直切主题 / 语言并跳转偏好设置
- 详细页面语义与交互约束见 [frontend-workspace.md](./frontend-workspace.md)

**部署**

- 本地开发 + Docker Compose 单机部署；详见 [deployment-and-operations.md](./deployment-and-operations.md)

### 明确不做

- Redis / Celery / MinIO / Qdrant 这类重基础设施
- 真正多租户级别的复杂权限系统
- 分布式部署和多机编排
- 多检索空间混合召回

## 3. 运行时边界

当前仍是单仓双应用，但运行目标明确是单机、本地优先：

- `apps/web`
  - React + Vite+ + TanStack Router file-based routes
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

V1 的核心边界已收敛：

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
- 资源重建会区分"文档不存在"和"文档尚未标准化"：缺失资源返回 `404 document_not_found`，未完成标准化返回 `409 document_not_normalized`
- 上传链路出现未知内部异常时，对外固定返回 `500 document_upload_failed`，日志保留原始异常，但接口不直接外泄内部错误文案

### 聊天问答

1. 会话先确定当前用户 personal `space` 检索范围；若本轮消息带附件，再优先收窄到当前附件对应文档修订
2. 非寒暄且存在可检索内容时才做 retrieval
3. 流式问答把运行态拆成 `chat_runs + chat_run_events + chat_messages`
4. 相同 `client_request_id` 命中时复用既有 run 并重放事件
5. 聊天执行 owner 当前统一由 `services/chat/workflow/*` 驱动同步和流式执行

**检索与召回**

- 当前对外只有一个活动检索空间，但内部允许存在一个正在构建的 generation
- 小聊、寒暄、致谢类短句默认不走 retrieval，也不会展示来源引用
- 本轮消息若带文档附件，response 链路会优先读取当前轮附件的标准化文本片段并带进上下文；retrieval 也会优先限域到这些附件对应的 `document_revision_id`
- 当前轮图片附件会在 provider 调用前直接重读原图、转成稳定 JPEG，并作为多模态 user content 注入 `ChatWorkflow`
- 多文档附件当前会先按附件集合做一次批量限域召回，再按 `document_revision_id` 在内存里做轮转式公平选取，避免单个文档吃满全局 `top_k`
- 当 `space_id` 与 `document_revision_id` 两类限域条件同时存在时，后端会先把它们归一化成 Chroma 兼容的复合 `where` 表达式
- 纯图片附件且只有泛化看图问法时同样默认跳过 retrieval，直接交给视觉分析
- Chroma 查询优先使用 query embedding；向量命中不足或 query embedding 生成失败时，退回 SQLite `FTS5` 词法候选兜底索引并做轻量重排；不会退回整代索引的全量词法扫描；embedding 生成与词法检索并行执行，减少词法兜底路径的串行等待
- 切换检索 provider 或检索 embedding model 后，会进入"保存设置 -> 启动后台重建 -> 成功后切换 active generation"的流程
- API 启动时预热当前 generation 的 Chroma collection，消除首次检索的冷启动延迟

**流式与并发**

- `ChatWorkflow + PydanticAI` 按"两条输出链路"接入：同步问答走结构化输出，流式问答走文本流式输出并通过工具结果收集 `sources_json`
- 会话级 `reasoning_mode` 当前会作用在 response provider；流式问答会把实际生效值写入 `chat_runs`
- 同一会话下重复发送相同 `client_request_id` 的流式请求时，后端会复用既有 `chat_run` 并重放已持久化事件
- 流式 assistant projection 和 `chat_run_events` 按短批次提交，避免整段回答长期持有 SQLite 写事务
- 受保护读取接口在鉴权阶段保持纯读，不再为 session 心跳同步写 `auth_sessions.last_seen_at`
- SQLite 连接层默认开启 `WAL` 和 `busy_timeout=30000`，降低流式事件写入与标准读取并发时触发锁错误的概率
- 认证类失败、图片处理失败和用户管理里的"资源缺失"都优先收敛成稳定业务语义

**前端交互**

- Web 主区默认通过 `/api/chat/sessions/{id}/messages?limit=80` 只读取最近一段消息窗口；继续向上滚动时再通过 `before_id + limit` 请求更早消息
- Web 右侧上下文栏走 `/api/chat/sessions/{id}/context`，返回当前会话已去重附件摘要和最近一次 assistant 引用
- Web 侧流式完成或失败时，优先 patch 已加载的消息窗口和会话摘要；只有 patch miss 时才回退到对应 query 的失效刷新
- 资源页筛选命中"看不到正在处理中的文档"时，前端改读轻量 `summary` 摘要判断是否仍需继续刷新
- 前端聊天运行时边界、会话恢复、默认标题、长会话视口等交互细节统一看 [frontend-workspace.md](./frontend-workspace.md)

## 6. 前端边界

- 前端桌面端当前分三类壳层：
  - 聊天壳层：`/chat` 三栏（会话 / 主区 / 上下文）
  - 工作台壳层：`/knowledge` 与 `/graph` 在一级 rail 下运行，`/knowledge` 用三栏 workbench，`/graph` 用占位页
  - 内容壳层：`/settings` 与 `/users` 继续使用内容页壳层
- 移动端统一退化为"顶部栏 + 抽屉 + 单栏主区"，不要求维持桌面列宽比例
- 具体页面语义、状态边界和交互约束统一看 [frontend-workspace.md](./frontend-workspace.md)

## 7. 阅读导航

文档阅读导航与按场景进入指引见 [docs/arch/README.md](./README.md)。
