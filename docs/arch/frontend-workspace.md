# 前端工作台

这份文档只讲 Web 工作台的产品骨架和工程边界，不重复后端数据、数据库设计和 Docker 细节。重点回答三个问题：

- 用户在工作台里会看到什么信息架构
- 前端状态、页面和组件边界怎么切
- 改工作台壳层、设置中心、聊天页或资源页时，应该先看哪里

配套阅读：

- [system-overview.md](./system-overview.md)
- [provider-and-settings.md](./provider-and-settings.md)
- [repo-map-and-conventions.md](./repo-map-and-conventions.md)

## 1. 产品定位

前端不是营销站，也不是传统后台多页面堆叠。当前实现是一套本地优先的工作台：

- 左侧负责模式切换和账户入口
- 中间承接主任务区
- 右侧承接上下文、来源引用、会话附件列表和状态辅助信息；当前通过独立会话摘要 query 读取“已去重附件 + 最近一次 assistant 引用”，在没有附件 / 引用时先收敛成单张概览卡

一级工作模式只有两个：

- `对话`
- `资源`

低频但必要的能力不再塞进左下角按钮阵列，而是集中到账户中枢和设置中心。

## 2. 当前信息架构

### 2.1 全局导航

左侧主导航当前承接：

- `对话`
- `资源`
- 设置页内的二级导航
- 底部账户中枢

当前没有把 `用户管理` 放成一级工作模式。管理员仍然能管理用户，但入口在设置中心里。

### 2.2 账户中枢

左侧底部固定为账户中枢，而不是“系统管理 / 个人操作”工具箱：

- 显示当前用户 `username`
- 显示当前角色 `admin / user`
- 整块账户卡作为统一 trigger，包含品牌 Avatar、用户名、角色和展开指示
- 菜单第一层直接提供 `主题` 与 `语言`
- 菜单底部保留 `更多个性化...` 跳转到 `/settings?section=preferences`
- 次动作保留 `退出登录`

这样做的原因很直接：

- 主导航回到“工作模式”而不是“功能按钮集合”
- 主题、语言属于高频全局偏好，应该和账户中枢放在一起，减少进入设置中心的层级
- 改密和用户管理仍然留在更稳定的设置层级
- 普通用户和管理员看到的工作台骨架更一致

### 2.3 设置中心

设置页不是单一 provider 配置页，而是设置中心。当前分组规则如下：

| 分组 | 谁可见 | 作用 |
| --- | --- | --- |
| `提供商配置` | 仅 `admin` | 主 Provider、默认模型、检索覆盖、备用模板、超时、连接测试 |
| `系统提示词` | 仅 `admin` | 维护问答系统提示词 |
| `偏好与外观` | 所有登录用户 | 语言、主题 |
| `账号安全` | 所有登录用户 | 修改密码 |
| `用户管理` | 仅 `admin` | 提供跳转 `/users` 的入口，不在设置页内嵌表格 |

默认分组：

- 管理员默认进入 `提供商配置`
- 普通用户默认进入 `偏好与外观`

当前 `提供商配置` 分组不再把 `response / embedding / vision` 三条 route 原样平铺到首屏。主区默认展示主 Provider 路径下当前生效的 `Chat / Embedding / Vision` 模型；高级项只再展开检索覆盖、备用模板和 Timeout。

补充约束：

- 保存设置和连接测试共用同一套本地校验
- 纯校验 helper 当前只返回稳定的 i18n key，由组件层按当前语言翻译错误文案
- provider 可达性、鉴权和模型存在性仍由后端 `test-routes` 健康检查判断，本地校验不替代连接测试
- `账号安全` 里的修改密码弹窗也遵循同样原则：前端先区分当前密码缺失 / 新密码缺失 / 新密码过短，后端 `invalid_credentials` 再翻译成当前语言下的“当前密码不正确”；修改密码成功后会结束当前登录状态，并回到登录页要求重新登录

## 3. 布局边界

### 3.1 桌面端

桌面端分两种壳层：

- 聊天工作区：左侧会话入口，中间主任务区，右侧上下文面板
- 标准工作区：左侧标准导航，右侧主内容区；两栏在同一层桌面壳层里贴边相邻，不额外插入独立卡片 gap
- `/chat` 在桌面端使用固定三栏 grid，不开放拖拽改列宽；`Cmd/Ctrl+B` 折叠左栏；右栏通过显式“收起上下文侧栏”按钮折叠，折叠后通过主区边缘按钮恢复
- 打开 `/chat` 入口时，前端会优先恢复最近一次访问的会话，恢复期间保持加载态，不先短暂落到空会话态；如果本地记录失效，则回退到当前列表里的首个会话；没有会话时保持空入口态
- `/knowledge`、`/settings`、`/users` 在桌面端复用标准工作区壳层；左侧标准导航改为嵌入式 surface，右侧内容不再额外包独立大卡片

不同页面下职责如下：

| 页面 | 主区 | 辅助区 / 壳层说明 |
| --- | --- | --- |
| `/chat` | 虚拟化消息流、交错消息卡片、输入区、发送与重试、统一折叠附件面板；主区默认先读取最近一段消息窗口，继续向上滚动时再请求更早消息；新会话空态默认只保留一句短引导并鼓励直接提问；系统默认标题只在渲染层按当前语言显示，不把本地化默认值写进持久化数据 | 会话概览、会话附件折叠面板、最近一次回答的来源分组、运行状态；右栏通过独立 `context` 摘要 query 读取；无附件 / 引用时只显示单张概览卡 |
| `/knowledge` | 上传、满宽资源列表、批量状态浏览；主区使用 `flat + wide` 连续轨道，不再包独立外卡片，内容起始轨道贴近工作区分隔线；长资源表格在行数超过阈值后切到固定表头 + 虚拟行；搜索框与类型 / 状态筛选当前直接驱动服务端列表 query，不再只在前端本地过滤 | 复用标准工作区壳层；资源详情改为按需打开的右侧预览抽屉，抽屉内承接版本入口、重建索引和打开原文件等操作 |
| `/settings` | 当前设置分组内容 | 复用标准工作区壳层；页面内部可自行排布辅助卡片，但不额外占用工作区第三栏 |
| `/users` | 管理员用户表和操作 | 复用标准工作区壳层；当前以主区为主，不依赖常驻右侧面板 |

### 3.2 移动端

移动端不强压三栏，而是退化成：

- 单栏主任务区
- 横向可滚动的设置分组入口
- 导航和上下文通过抽屉或局部展开承接

规则是“保功能，不保桌面布局比例”。

## 4. 页面职责

### 4.1 路由层

当前顶层路由与守卫定义在 `apps/web/src/router.tsx`、`apps/web/src/router/bootstrap-gate.tsx`、`apps/web/src/router/guards.tsx`：

- `/login`
- `/chat`
- `/knowledge`
- `/settings`
- `/users`
- `/403`

权限规则：

- 启动期先通过 `/api/auth/bootstrap` 尝试恢复 refresh session
- 未登录或 access token 失效统一跳到 `/login`，并保留原目标地址
- 已登录访问 `/login` 会被重定向到 `/chat`
- 普通用户访问 `/users` 会看到 `403` 页面
- 如果启动期鉴权探测失败，受保护页面会显示认证降级页；`/login` 仍保持可访问

### 4.2 页面装配层

`pages/*` 只负责路由入口和页面装配，不堆重业务逻辑。当前重点页面：

| 页面入口 | 责任 |
| --- | --- |
| `src/pages/auth/login-page.tsx` | 登录、语言切换、主题切换、入口说明；若登录前改了主题，登录成功后会同步账号偏好 |
| `src/pages/chat/chat-page.tsx` | 会话、虚拟化消息视口、交错消息排版、同步/流式发送、统一折叠附件面板、图片 viewer、会话级思考模式；`/chat` 入口会优先恢复最近一次访问的会话并先保持加载态；当前 response provider 缺少必填配置时，composer 底部会切成“先配置 Ollama”入口，并在发送前给出国际化提示；当前轮有附件时会显式提示附件作用域 |
| `src/pages/knowledge/knowledge-page.tsx` | 资源上传、upload readiness 门禁、宽轨道列表、预览抽屉、版本入口、重建索引 |
| `src/pages/settings/settings-page.tsx` | 设置中心四个分组的主区内容 |
| `src/pages/users/users-page.tsx` | 管理员用户管理页 |

## 5. 状态边界

### 5.1 服务端状态

`TanStack Query` 是服务端真相源，负责：

- 当前登录用户
- 资源列表和预览相关数据
- 设置中心里的提供商配置与系统提示词
- 用户管理列表
- 会话、消息、运行态查询

不要把这些最终结果再复制一份进本地 store。

### 5.2 本地 UI 状态

`Zustand` 只承接短生命周期或纯界面状态，例如：

- 当前语言
- 当前主题
- 布局折叠状态
- 前端会话状态：`bootstrapping / authenticated / anonymous / expired / degraded`
- 聊天输入草稿
- 待发送附件队列
- 发送快捷键
- 正在进行中的流式 run 辅助状态
- 当前会话是否处于提交中
- 登录后要回跳的 `redirectTo`
- 最近访问的聊天会话 ID

当前实现里，这些状态通过 persist middleware 落到 `localStorage`，并在跨标签页通过 `storage` 事件重放到 store。

聊天相关服务端状态当前进一步收敛成两条 query：

- 主区消息：分页 `messagesWindow`，默认先拿最近 80 条，再按 `before_id + limit` 取更早消息
- 右栏上下文：`context` 摘要，返回已去重附件和最近一次 assistant 引用

认证补充约束：

- access token 当前只保存在内存，不落 `localStorage`
- refresh token 继续走 HttpOnly cookie，不在前端可读范围内
- `/api/auth/bootstrap` 负责启动期恢复：匿名态返回 `200 + authenticated=false`，已登录态返回新 access token 和当前用户
- `lib/api/generated/client.ts` 会自动附加 bearer access token；遇到 `401` 时按单飞策略调用 `/api/auth/refresh`
- 若刷新失败，会清空内存 access token 并把会话状态标记为 `expired`
- 修改密码这类账号安全错误不会直接把后端原始 message 塞回 UI；已知语义码会在组件层按当前语言翻译后展示；修改密码成功时，前端会清空当前用户缓存、把会话状态标记为 `expired`，并回到登录页

聊天页当前还有一个明确约束：composer 的禁用态跟随当前聚焦会话，而不是全局聊天页面。也就是说，会话 A 正在上传附件或等待流式返回时，切到会话 B 不会把 B 的输入框和发送按钮一起锁死；如果 A 在后台完成，会通过 toast 给出完成提示。

发送前附件上传当前还有一个明确约束：聊天区待发送附件使用最多 2 个并发上传，但只有当本轮所有附件都上传成功后，才会真正发起聊天流式请求；任一附件失败时，前端会恢复原始草稿和附件队列，而不是半成功地发出一条缺附件消息。

会话入口和标题当前还有两个约束：

- `/chat` 入口优先恢复最近访问的会话；如果本地记录已经失效，则回退到当前会话列表第一项；恢复期间先保持加载态，不先短暂暴露空入口态；没有会话时清理记录并保持空入口态
- 系统默认标题只在渲染层按当前语言兜底；新建会话或把标题清空时提交空值，用户自己输入并确认过的标题原样持久化
- 后台完成 toast 的标题解析与侧边栏保持一致：优先显示已持久化标题；标题为空时，按当前语言回退到同一套默认标题文案，而不是额外拼接 `Session {{id}} / 会话 {{id}}`

待发送附件队列还有一个补充约束：同一会话里，本地附件在进入 store 前会按 `name + type + size + lastModified` 做轻量去重。目标不是识别“语义相同文件”，而是拦住用户重复选择、拖拽或粘贴同一文件后造成的重复追加和重复上传。

### 5.3 主题与语言

主题和语言现在都先进入前端本地 store，再各自决定是否需要继续同步到服务端：

- 语言：Zustand persist + `localStorage`
- 主题：Zustand persist + `localStorage`；登录用户在设置中心或账户中枢切换时都会通过 `/api/auth/preferences` 持久化到当前用户账号；若匿名态在登录页先切了主题，登录成功后也会把当前本地主题补写到账号偏好

这也是为什么设置中心里的 `语言 / 主题` 不会混进 `/api/settings` 的 provider 保存表单。

### 5.4 表单状态

常规业务表单优先由 `TanStack Form` 管理；像 provider 设置页这类需要把 wire contract 映射成页面模型的复杂表单，可以在页面内部额外保留一层 view-model：

- 字段值与校验状态放在 form store
- 提交中状态通过 `form.Subscribe` 驱动按钮和反馈
- 页面和对话框组件默认不再手写 `useState + FormEvent` 维护简单表单值；但复杂设置页允许先做 route/profile -> page model 映射，再统一提交

## 6. 组件与目录边界

### 6.1 壳层与导航

- `src/layouts/app-shell-layout.tsx`
  负责整体工作台编排
- `src/features/workspace/components/standard-sidebar.tsx`
  负责左侧标准侧栏、设置分组导航和账户中枢
- `src/components/ui/sidebar.tsx`
  负责工作台侧栏的基础原语；标准侧栏和会话侧栏当前都优先在这层组合，而不是各自维护一套平行容器

### 6.2 业务 feature

| 目录 | 责任 |
| --- | --- |
| `features/auth` | 登录、登出、改密、偏好更新 |
| `features/chat` | 会话、消息、流式问答、虚拟消息视口、统一折叠附件面板、图片 viewer、来源引用 |
| `features/knowledge` | 资源列表、上传、预览抽屉、版本、重建索引 |
| `features/settings` | provider API、query/mutation 配置、设置分组定义、偏好控件 |
| `features/users` | 用户管理 |
| `features/workspace` | 工作台侧栏、上下文栏、壳层业务片段 |

### 6.3 基础设施目录

- `components/ui`：基础 UI 组件
- `components/shared`：跨 feature 复用但不带强业务语义的组件
- `lib/api`：API 客户端、query keys、基础类型
- `lib/api/generated`：OpenAPI 生成的契约类型和 typed client 入口
- `lib/forms.ts`：轻量表单辅助
- `lib/config`：环境变量和常量
- `providers`：Query、Theme、i18n、store 同步等 provider

当前两个实现约束也放在这里：

- `lib/forms.ts` 除了错误消息抽取，也承接共享 submit event helper；TanStack Form 对话框优先复用，不再重复手写 `preventDefault + catch(() => {})`
- `lib/api/client.ts` 当前只把网络失败和 `AbortError` 归一化成通用前端错误；后端显式错误和前端契约错误保持原始语义

当前 UI 收敛约束：

- 工作台左侧标准导航与会话侧栏优先复用 `components/ui/sidebar`
- 会话行的辅助动作优先收进 `components/ui/dropdown-menu`
- 设置页保存区的错误 / 成功提示优先复用 `components/ui/alert`

当前 API 约束：

- `apps/web/openapi/schema.json` 是前端消费的 OpenAPI 快照
- `features/*/api` 继续承接业务调用封装，但响应 / 请求类型优先引用生成契约
- 改后端 route / schema 后，先在 `apps/web` 执行 `vp run api:generate`

## 7. 交互约束

### 7.1 上传与索引反馈

前端必须区分两件事：

- 文件被加入本地待发送 / 待上传队列
- 文件真正落到后端资源域并完成标准化、切块和索引

在没有后端真实进度协议前，不伪造“上传 + 标准化 + 切块 + 索引”的总百分比。当前稳定做法是：

- 允许展示浏览器可获得的文件上传字节进度；当传输达到 `100%` 但接口响应尚未返回时，切换为“已上传，处理中”，不把 `100%` 当作资源已可用
- 资源页上传队列默认展开；失败项保持自动展开，并支持取消 / 重试 / 移除
- 资源列表继续用 `uploaded / processing / indexed` 这类稳定状态表达后端真实进度

聊天工作台的附件与消息交互统一遵循：

- 输入框、消息区和右侧会话概览统一走可折叠附件面板与共享图片 viewer
- 当前轮有附件时，输入区显式提示“本次回答只会使用当前附件作为文档范围”
- 同一会话里重复选择、拖拽或粘贴同一文件时，不重复追加到待发送附件队列
- 右侧来源区只展示最近一次 assistant 回答的 `sources_json`，并按文档聚合
- 右侧会话概览当前通过独立 `context` 摘要 query 刷新；流式完成或失败时优先 patch 当前消息窗口与该摘要，而不是默认整段重拉消息历史
- 新会话空态默认鼓励直接提问；资源上传保留，但不再作为唯一开始路径
- 消息视口由 `ChatMessageViewport` 负责虚拟化、贴底、向上加载更早消息与回到底部语义；消息卡片内部继续按“角色 / 状态 / 正文 / 附件 / 恢复带”分层
- 图片处理类失败优先翻译成语义化、可国际化提示，不直接向用户回显 provider 原始报错

### 7.2 危险操作

以下动作默认要求二次确认：

- 删除资源
- 删除普通用户

### 7.3 设置中心

设置中心的交互边界要保持稳定：

- `提供商配置` 和 `系统提示词` 只对管理员展示，并走 `/api/settings`
- `偏好与外观`、`账号安全` 对所有已登录用户开放
- `用户管理` 仍保留独立 `/users` 页面，不塞进设置页大表格
- 本地校验 helper 继续只返回稳定 i18n key；展示层按当前语言翻译文案
- 主区承载当前生效配置；高级区只承载检索覆盖、备用模板和 Timeout

## 8. 从哪里开始读代码

### 想看工作台壳层

1. `apps/web/src/router.tsx`
2. `apps/web/src/layouts/app-shell-layout.tsx`
3. `apps/web/src/features/workspace/components/standard-sidebar.tsx`

### 想看设置中心

1. `apps/web/src/features/settings/settings-sections.ts`
2. `apps/web/src/pages/settings/settings-page.tsx`
3. `apps/web/src/features/settings/components/provider-form.tsx`

### 想看聊天和资源主页面

1. `apps/web/src/pages/chat/chat-page.tsx`
2. `apps/web/src/pages/knowledge/knowledge-page.tsx`
3. `apps/web/src/features/chat/*`
4. `apps/web/src/features/knowledge/*`
