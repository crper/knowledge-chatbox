# API 与权限边界

## 1. 设计原则

- route 只处理 HTTP 语义
- service 负责完整用例与事务边界
- repository 只负责数据访问
- FastAPI OpenAPI 是接口契约真相源；`/docs`、`/redoc`、`/openapi.json` 与前端契约生成共用同一份 schema

## 2. 认证与角色

- `POST /api/auth/login`
- `POST /api/auth/bootstrap`
- `POST /api/auth/refresh`
- `GET /api/auth/me`
- `POST /api/auth/logout`

当前约束：

- `POST /api/auth/login` 当前返回短期 bearer `access token`，并继续通过 HttpOnly cookie 写入可轮换 `refresh session`
- `POST /api/auth/bootstrap` 用于启动期恢复 refresh session；匿名态返回 `200 + authenticated=false`，已登录态只返回新的 bearer `access token + user`，不轮换 refresh session
- `POST /api/auth/refresh` 会轮换 refresh session，并返回新的 bearer `access token`
- `GET /api/auth/me`、`/api/settings` 等受保护读取接口当前优先接受 `Authorization: Bearer <token>`
- `GET /api/auth/me` 当前是纯读取会话与用户，不在每次请求里同步刷新 `auth_sessions.last_seen_at`
- session 心跳如果需要演进，应该走低频或异步策略，不要重新把“每个受保护请求都写一次库”塞回鉴权路径

角色仍只有：

- `admin`
- `user`

## 3. 路由分组

| 路由前缀         | 能力                                           | user   | admin  |
| ---------------- | ---------------------------------------------- | ------ | ------ |
| `/api/auth`      | 登录、当前用户、改密、偏好                     | 可用   | 可用   |
| `/api/chat`      | 会话、消息、同步/流式问答、运行态              | 可用   | 可用   |
| `/api/documents` | 资源列表、上传、修订历史、下载、删除、重建索引 | 可用   | 可用   |
| `/api/settings`  | provider 设置、route 健康检查                  | 不可用 | 可用   |
| `/api/users`     | 用户管理、重置密码                             | 不可用 | 可用   |
| `/api/health`    | 服务健康                                       | 可匿名 | 可匿名 |

## 4. 资源接口

- `GET /api/documents`
- `GET /api/documents/summary`
- `GET /api/documents/upload-readiness`
- `GET /api/documents/{document_id}`
- `GET /api/documents/{document_id}/revisions`
- `POST /api/documents/upload`
- `POST /api/documents/{document_id}/reindex`
- `DELETE /api/documents/{document_id}`
- `GET /api/documents/{document_id}/file`
- `GET /api/documents/revisions/{revision_id}/file`

关键语义：

- 列表返回逻辑 document 视角，并内嵌 `latest_revision`
- `GET /api/documents` 当前支持服务端 `query / type / status` 过滤；资源页搜索与筛选直接复用这条列表接口，不再只靠前端本地过滤
- `GET /api/documents/summary` 当前只返回资源列表所需的轻量摘要字段；目前用于资源页筛选态下的 `pending_count` 轮询，不替代完整列表接口
- `GET /api/documents/upload-readiness` 当前只返回资源上传所需的最小配置是否就绪；它不是 provider 实时探活接口
- 修订历史单独走 `/revisions`
- 上传返回 `{ deduplicated, document, revision, latest_revision }`
- 同名同 hash 仍会直接命中已有修订并返回 `200`
- 上传前会先校验当前 `embedding_route`；若活动 route 缺配置，返回 `409 embedding_not_configured`
- 索引重建中若 `pending_embedding_route` 缺配置，也会阻断新上传并返回 `409 pending_embedding_not_configured`
- `vision_route` 缺配置不会阻断图片上传；图片会退化成基础文件信息入库
- `POST /api/documents/{document_id}/reindex` 会区分资源缺失与状态冲突：
  - 文档不存在：`404 document_not_found`
  - 文档尚未完成标准化：`409 document_not_normalized`
- 上传链路的未知内部失败统一返回 `500 document_upload_failed`，不会把原始异常字符串直接暴露给前端

## 5. 聊天接口

- `POST /api/chat/sessions`
- `GET /api/chat/sessions`
- `PATCH /api/chat/sessions/{session_id}`
- `DELETE /api/chat/sessions/{session_id}`
- `GET /api/chat/sessions/{session_id}/messages`
- `POST /api/chat/sessions/{session_id}/messages`
- `POST /api/chat/sessions/{session_id}/messages/stream`
- `POST /api/chat/messages/{message_id}/attachments/{attachment_id}/archive`
- `DELETE /api/chat/messages/{message_id}`
- `GET /api/chat/runs/active`
- `GET /api/chat/runs/{run_id}`
- `POST /api/chat/runs/{run_id}/cancel`

关键语义：

- SSE 协议与事件名保持不变
- `client_request_id` 继续只属于 user message
- 同会话相同 `client_request_id` 会复用既有 run 并回放事件
- `POST /api/chat/runs/{run_id}/cancel` 只允许取消仍处于 `pending / running` 的 run；成功后 run 状态收口为 `cancelled`
- 附件输入当前以 `document_revision_id` 为准
- 图片附件不会在前端请求里直接携带 provider-ready 二进制；文档附件也不会直接携带正文
- 服务端会在调用 provider 前按 `document_revision_id` 读取原图或标准化文本，并完成当前轮附件限域
- `POST /api/chat/messages/{message_id}/attachments/{attachment_id}/archive` 当前除了校验消息归属，也会校验目标 `document_revision_id` 是否属于调用者可见的 space；不会再允许跨用户 / 跨 space 归档附件引用
- 更细的附件输入、检索限域和多附件合并语义，统一看 [runtime-flows.md](./runtime-flows.md)

## 6. 设置接口

- `GET /api/settings`
- `PUT /api/settings`
- `POST /api/settings/test-routes`

当前请求与响应都围绕：

- `provider_profiles`
- `response_route`
- `embedding_route`
- `pending_embedding_route`
- `vision_route`
- `active_index_generation / building_index_generation / index_rebuild_status`

更细字段说明看 [provider-and-settings.md](./provider-and-settings.md)。

## 7. 统一错误响应

所有业务错误继续统一走：

- `Envelope.success = false`
- `Envelope.error.code`
- `Envelope.error.message`
- `Envelope.error.details`

当前约束：

- route 层优先抛领域异常或 `AppError`，不再把大多数业务分支手工包装成 `HTTPException`
- OpenAPI 当前会为关键管理接口、文档重建接口和 SSE 接口显式声明常见错误响应；运行时错误语义与文档保持同一套 Envelope 契约
- 文档链路的状态冲突、资源缺失、未知上传失败都保持稳定错误码
- 用户管理里资源缺失当前返回 `404 user_not_found`
- provider 原始格式错误不作为长期稳定的用户文案契约；对外优先暴露稳定语义，再由前端做国际化展示
- 流式问答与标准工作区页面读取要避免共享同步写路径；否则 SQLite 容易在长回答期间把 `/api/auth/me`、`/api/settings` 这类读取请求锁成 `500`

## 8. 关键代码入口

- `apps/api/src/knowledge_chatbox_api/api/routes/*.py`
- `apps/api/src/knowledge_chatbox_api/services/chat/*`
- `apps/api/src/knowledge_chatbox_api/services/documents/*`
- `apps/api/src/knowledge_chatbox_api/services/settings/settings_service.py`
