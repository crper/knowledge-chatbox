# Provider 与设置

当前实现没有独立的 `provider_profiles` / `capability_routes` 表。Provider 连接参数、模型模板、活动 route 和待切换的 embedding route 都收敛在 `app_settings` 一条记录里，并通过强类型 JSON 字段读写。

## 1. 设计目标

- 只保留一个全局设置真相源，减少多表同步复杂度
- provider profile 与 capability route 仍保持强类型，避免“一个大 JSON 什么都能塞”
- embedding route 切换继续保留 `pending + generation rebuild` 语义
- 前端和测试统一消费扁平 settings API，不再维护旧的 `profiles / routes / indexing` 兼容形状
- 前端 provider 表单的本地校验保持纯逻辑：helper 只返回校验 key，展示层按当前 i18n 语言翻译，避免在纯函数里写死中文文案

## 2. 存储形状

### `app_settings`

当前关键字段：

- `provider_profiles_json`
- `response_route_json`
- `embedding_route_json`
- `pending_embedding_route_json`
- `vision_route_json`
- `system_prompt`
- `provider_timeout_seconds`
- `active_index_generation`
- `building_index_generation`
- `index_rebuild_status`
- `updated_by_user_id`
- `updated_at`

说明：

- `provider_profiles_json` 保存四类 provider 的连接参数和 provider 级模型模板
- `response_route_json / embedding_route_json / vision_route_json` 保存当前活动 capability route
- `pending_embedding_route_json` 只在检索链路切换期间存在，用来描述“下一代索引要切到哪个 embedding route”
- secret 字段返回给前端时仍会被掩码成 `********`

### `provider_profiles_json` 的逻辑内容

- `openai`
  - `api_key / base_url / chat_model / embedding_model / vision_model`
- `anthropic`
  - `api_key / base_url / chat_model / vision_model`
- `voyage`
  - `api_key / base_url / embedding_model`
- `ollama`
  - `base_url / chat_model / embedding_model / vision_model`

这些模板字段会在保存 route 后同步回 profile，保证设置页再次打开时看到的是“当前真实会生效的模型值”。

## 3. route 语义

### response

- 保存后立即生效
- 会同步更新对应 provider 的 `chat_model`
- 不触发索引重建
- 附件输入整形发生在真正调用 provider 前：图片会按 `document_revision_id` 重读并统一转成稳定图片 payload，文档附件会读取标准化文本并拼进当前轮上下文
- 这层只负责输入整形与 provider 调用，不维护一份前端可用的“模型是否支持看图”静态表
- 更细的附件输入链路与多附件检索语义，统一看 [runtime-flows.md](./runtime-flows.md)

### vision

- 保存后立即生效
- 会同步更新对应 provider 的 `vision_model`
- 影响文档标准化阶段，以及纯图片泛化问法的视觉分析
- 图片解码失败时返回稳定语义，再由前端按当前语言展示

### embedding

- 保存后不会立刻替换 `embedding_route`
- 新目标先写入 `pending_embedding_route`
- 同时推进 `building_index_generation`，并把 `index_rebuild_status` 置为 `running`
- 后台重建成功后，再把 `pending_embedding_route` promote 为活动 route
- 重建失败时，活动 `embedding_route` 保持不变，状态标记为 `failed`

## 4. Settings API

### `GET /api/chat/profile`

当前返回：

- `provider`
- `model`
- `configured`

说明：

- `configured` 用于前端判断当前 response provider 是否已经具备最小可发送条件
- 目前判断规则保持克制：`OpenAI / Anthropic` 要求存在 `api_key`，`Ollama` 要求存在 `base_url`

### `GET /api/settings`

当前返回扁平结构，核心字段包括：

- `id`
- `provider_profiles`
- `response_route`
- `embedding_route`
- `pending_embedding_route`
- `vision_route`
- `system_prompt`
- `provider_timeout_seconds`
- `updated_by_user_id`
- `updated_at`
- `active_index_generation`
- `building_index_generation`
- `index_rebuild_status`

补充：

- `rebuild_started`
- `reindex_required`

### `PUT /api/settings`

当前接收：

- `provider_profiles`
- `response_route`
- `embedding_route`
- `vision_route`
- `system_prompt`
- `provider_timeout_seconds`

### `POST /api/settings/test-routes`

- 请求体与 `PUT /api/settings` 相同
- 服务端会把传入值叠加到当前设置上，构造一份临时 draft
- 响应只返回三条 capability 的健康检查结果：`response / embedding / vision`
- OpenAI 兼容端点的快速健康检查会优先确认可用模型列表；如果中转站只实现了 `/v1/models`、没有实现 `/v1/models/{id}`，也不会把这类 404 误判成整条链路不可用
- 如果 OpenAI 兼容端点返回 401 / `INVALID_API_KEY`，测试结果会稳定归类为“API Key 无效或被拒绝”，前端按当前语言展示，不直接透传原始 SDK 异常
- Ollama 连接测试在返回 502 或请求失败时，会提示当前 Base URL 是否更适合本机直跑的 `localhost:11434`，还是容器场景下的 `host.docker.internal:11434`

## 5. 前端设置页约束

- `ProviderForm` 当前复用同一份本地 draft model 处理“保存设置”和“测试连接”
- 主区保留当前状态摘要、主配置表单和必要操作入口；高级区只承载检索覆盖、备用模板和 Timeout
- 本地校验 helper 只返回稳定的 validation key；具体文案在组件层通过 i18n 翻译
- 本地校验只负责字段完整性和基础数值约束；provider 可达性、鉴权和模型存在性仍通过 `POST /api/settings/test-routes` 判断
- `system_prompt` 的默认值当前是“知识工作台助手”聚焦版：强调先给结论、再给依据、优先引用资料事实；如果管理员明确清空并保存空字符串，后续对话就不再附带默认 system prompt
- `账号安全` 分组里的修改密码弹窗沿用同一原则：前端先做字段校验，后端保留 `invalid_credentials` 这类稳定语义码；修改密码成功后当前登录状态立即失效，前端回到登录页要求重新登录
- 设置中心的页面组织与交互边界，统一看 [frontend-workspace.md](./frontend-workspace.md)

## 6. 索引重建状态

- 活动态：`embedding_route + active_index_generation`
- 待切换态：`pending_embedding_route + building_index_generation`
- 状态位：`index_rebuild_status`

前端显示逻辑：

- 如果 `pending_embedding_route` 非空，设置页会优先把它作为“当前检索目标”展示
- `rebuild_started / reindex_required` 是一次保存操作返回给前端的即时反馈，不是长期状态字段

## 7. 关键代码入口

- `apps/api/src/knowledge_chatbox_api/models/settings.py`
- `apps/api/src/knowledge_chatbox_api/schemas/settings.py`
- `apps/api/src/knowledge_chatbox_api/services/settings/settings_service.py`
- `apps/api/src/knowledge_chatbox_api/api/routes/settings.py`
- `apps/api/src/knowledge_chatbox_api/services/documents/rebuild_service.py`
- `apps/web/src/features/settings/components/provider-form-state.ts`
- `apps/web/src/features/settings/components/provider-form.tsx`
