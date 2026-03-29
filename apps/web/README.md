# Knowledge Chatbox Web

> Knowledge Chatbox 的前端工作台

`apps/web` 负责登录、对话、资源、设置和用户管理这套 Web 工作台。这里主要记录前端包内需要长期维护的工程信息：命令、目录边界、状态边界、共享组件入口和读代码顺序。

接手这个包前，先回仓库根目录看根 [README.md](../../README.md) 的唯一官方开发主线；这里不再重复维护仓库级启动流程，只补充前端包内命令和结构边界。

完整的信息架构、交互语义和工作台产品边界，以 [docs/arch/frontend-workspace.md](../../docs/arch/frontend-workspace.md) 为准；这里不再平行维护一套产品说明。

```text
+----------------------+--------------------------------+----------------------+
| 左栏                 | 中栏                           | 右栏                 |
| 模式 / 会话 / 账户   | 消息流 / 资源主区 / 设置内容   | 上下文 / 来源 / 详情 |
+----------------------+--------------------------------+----------------------+
```

## 先读哪里

第一次接手前端，建议按这个顺序补上下文：

- [README.md](../../README.md)
- [CONTRIBUTING.md](../../CONTRIBUTING.md)
- [docs/arch/system-overview.md](../../docs/arch/system-overview.md)
- [docs/arch/frontend-workspace.md](../../docs/arch/frontend-workspace.md)
- [docs/arch/provider-and-settings.md](../../docs/arch/provider-and-settings.md)
- [apps/api/README.md](../api/README.md)

## 这个包负责什么

- 路由、工作台壳层和受保护页面分流
- 对话、资源、设置、用户管理四类主页面
- OpenAPI 契约消费、前端认证恢复和本地 UI 状态协调

## 技术栈

- React 19
- TypeScript
- Vite+
- React Router
- TanStack Query
- TanStack Form
- react-virtuoso
- Zustand
- openapi-typescript / openapi-fetch
- i18next
- shadcn/ui
- Tailwind CSS 4
- Streamdown

## 常用命令

`vp` 是项目使用的 Vite+ 统一前端工具链命令，项目主页见 [voidzero-dev/vite-plus](https://github.com/voidzero-dev/vite-plus)。这个包里的开发、检查、测试和构建都通过 `vp` 入口执行，不直接使用 `pnpm`、`npm` 或 `yarn`。

这些命令默认建立在仓库根目录已经执行过 `just setup` 的前提上。

```bash
cd apps/web
vp run api:generate
vp dev
vp check --fix
vp test
vp build
```

说明：

- 如果改了 `apps/api` 的 route / schema，先执行 `vp run api:generate`
- `vp check --fix` 会统一执行格式化、Lint 和 TypeScript 检查，并自动修复可修复项
- `vp run api:check` 用于校验 `apps/web/openapi/schema.json` 和生成类型是否跟后端保持同步
- `vp run api:check` / `just web-check` 如果提示 OpenAPI snapshot 或生成类型过期，标准修复入口就是 `vp run api:generate`
- `vp test` 跑前端测试
- `vp build` 产出生产构建

如果你要的是本地单机稳定运行，不要继续把 `vp dev` 当成部署入口，请回到仓库根目录看 [README.md](../../README.md) 的 Docker / 单机部署部分，入口是 `just docker-up`。

## 环境变量

前端主要依赖：

- `VITE_API_BASE_URL`：浏览器访问后端 API 的基地址

通常从仓库根目录 `.env` 读取，不单独维护一份前端私有环境文件。

## 页面与壳层

- `/chat` 在桌面端是三栏工作区，移动端退化为抽屉和单栏
- `/knowledge`、`/settings`、`/users` 共享标准工作区壳层
- 完整布局与视觉语义去看 [docs/arch/frontend-workspace.md](../../docs/arch/frontend-workspace.md)

### 主要页面

| 页面   | 作用                                             | 主要代码入口                             |
| ------ | ------------------------------------------------ | ---------------------------------------- |
| 登录页 | 登录、主题/语言切换、登录前后偏好衔接            | `src/pages/auth/login-page.tsx`          |
| 对话页 | 会话、分页消息窗口、同步/流式问答、附件面板、图片 viewer、右栏上下文摘要 | `src/pages/chat/chat-page.tsx`           |
| 资源页 | 上传、资源列表、预览抽屉、版本详情、重建索引     | `src/pages/knowledge/knowledge-page.tsx` |
| 设置页 | 提供商配置、系统提示词、偏好与账号安全           | `src/pages/settings/settings-page.tsx`   |
| 用户页 | 管理员用户管理                                   | `src/pages/users/users-page.tsx`         |
| 系统页 | 认证降级页与 `403` 页面                          | `src/pages/system/*`                     |

## 工程结构

```text
apps/web/
  openapi/
    schema.json               # 从 apps/api 导出的 OpenAPI 快照
  src/
    app.tsx                    # 应用根壳
    main.tsx                   # 浏览器入口
    router.tsx                 # 路由与顶层守卫
    router/                    # 启动门禁与路由守卫
    providers/                 # Query / Theme / i18n / Router provider
    layouts/                   # 应用壳层与面板编排
    pages/                     # 路由入口与页面装配层
    features/
      auth/                    # 登录、改密、认证 API
      chat/                    # 会话、消息、流式问答、虚拟消息视口、统一折叠附件面板、图片 viewer
      knowledge/               # 资源列表、上传、版本历史
      settings/                # 设置中心、分组导航、偏好控件、provider 表单
      users/                   # 用户管理
      workspace/               # 工作台侧栏、上下文栏、折叠 rail
    components/
      ui/                      # 基础 UI 组件
      shared/                  # 跨 feature 复用组件
    lib/
      auth/                    # 会话状态、token 内存存储、启动编排
      api/generated/           # OpenAPI 生成类型与 typed client
                               # 其他 API / config / hooks / store / utils
    i18n/                      # 中英文文案
    styles/                    # 全局样式与设计 token
    test/                      # 测试初始化
```

## 目录约定

- `pages/` 只负责页面装配，不堆业务细节
- `layouts/` 只负责壳层编排，不继续吞业务组件
- `features/*` 承接业务组件、query/mutation、页面级编排和纯逻辑
- `features/workspace/*` 专门承接工作台壳层里的业务化片段，比如标准侧栏、会话侧栏、上下文面板、折叠把手
- `features/settings/*` 统一承接设置中心相关模型和偏好控件，避免设置语义散落到 `shared` 或 `auth`
- `components/ui` 只放基础 UI
- `components/shared` 只放跨 feature 复用且无强业务语义的组件
- `lib/*` 只放跨 feature 的轻量基础能力，不放具体业务流程
- `lib/forms.ts` 统一承接轻量表单辅助；错误消息抽取和共享 submit event helper 都优先放这里，不要在每个对话框里重复写一遍
- `lib/document-upload.ts` 统一承接聊天区和资源页共用的 document upload workflow helper；它会带上当前 access token，并在 `401` 时单飞刷新后重试一次

## 状态边界

- `TanStack Query`：服务端真相源，负责获取、缓存、失效和刷新
- `TanStack Form`：登录、改密、用户管理、系统配置等表单的字段值、校验和提交状态
- `Zustand`：本地 UI 状态，例如当前会话、布局状态、草稿、临时附件、语言、主题、发送快捷键、前端会话状态和进行中的流式 run / 会话级发送锁
- `lib/api/client.ts`：前端 API envelope 解包与错误归一化；当前只统一处理网络失败和 `AbortError`，后端显式错误和契约错误保持原始语义；认证类错误会在展示层优先翻译成本地化文案

规则：

- 服务端列表、详情、最终结果不要再复制一份进 Zustand
- 页面优先组合 `features/*` 的 hook 和组件，不在 page 里直接堆 query + mutation + 副作用
- access token 当前只放在内存，不进 `localStorage`；前端会话状态单独放在 `lib/auth/session-store.ts`，用于区分 `bootstrapping / authenticated / anonymous / expired / degraded`
- 顶层 `AppBootstrapGate` 会在路由渲染前尝试通过 `/api/auth/bootstrap` 恢复 refresh session；匿名态返回 `200 + authenticated=false`，不会把登录页首屏探测表现成控制台错误；若启动恢复失败且当前不是 `/login`，受保护页面会在“回登录页”和“认证降级页”之间做分流
- 聊天主区当前默认读取分页 `messagesWindow`：先拿最近 80 条消息，继续向上滚动时再带 `before_id + limit` 取更早消息；右侧上下文栏通过独立 `context` 摘要 query 读取已去重附件和最近一次 assistant 引用
- provider 设置页这类复杂表单，纯校验 helper 当前只返回 i18n key；具体文案由组件层按当前语言翻译，不在纯逻辑层硬编码中英文字符串
- 主题先写本地 store；登录用户在设置中心或账户中枢切换时会同步 `/api/auth/preferences`，登录页匿名态先切的主题会在登录成功后补写到账号偏好
- 最近访问的聊天会话 ID 会持久化到 `localStorage`；打开 `/chat` 时优先恢复该会话，恢复期间先保持加载态；若记录已失效则回退到当前列表第一项，没有会话时清空记录并保持空入口态
- 聊天输入区的提交锁按会话隔离：只锁当前正在提交的会话；切到别的会话后，若该会话没有自己的提交任务，输入和发送保持可用
- 聊天区附件上传和资源页上传共用同一套 document upload helper，拒绝原因、进度 patch 和失败文案保持一致；聊天区待发送附件使用最多 2 个并发上传，但只有当本轮全部上传成功后才真正发起流式请求；上传请求会优先携带 bearer token，遇到 `401` 会自动刷新并重试一次
- 聊天区待发送附件在进入 Zustand 前会按 `name + type + size + lastModified` 做本地去重；同一会话里重复选择、拖拽或粘贴同一文件时，不再重复追加
- 图片附件真正发给模型前，不在前端长期保存 provider-ready 图片数据；后端会按 `document_revision_id` 重读原图并统一转成稳定 JPEG payload
- `ChatMessageViewport` 负责长会话虚拟化、贴底、向上加载更早消息与回底部语义
- `features/chat/components/attachment-list.tsx` 与 `image-viewer-dialog.tsx` 负责聊天附件展示与图片查看
- `components/shared/workspace-page.tsx` 和 `components/shared/data-table.tsx` 是标准工作区和资源列表的共享壳层

## 关键共享组件

- 主题 token：`src/styles/globals.css`
- 工作台壳层：`src/layouts/app-shell-layout.tsx`
- 共享 `workspace-page`：`src/components/shared/workspace-page.tsx`
- 共享 `data-table`：`src/components/shared/data-table.tsx`
- 聊天附件：`src/features/chat/components/attachment-list.tsx`
- 图片 viewer：`src/features/chat/components/image-viewer-dialog.tsx`
- 消息视口：`src/features/chat/components/chat-message-viewport.tsx`
- 消息列表：`src/features/chat/components/message-list.tsx`

## 读代码入口

### 想看页面怎么拼

1. `src/router.tsx`
2. `src/router/bootstrap-gate.tsx`
3. `src/router/guards.tsx`
4. `src/layouts/app-shell-layout.tsx`
5. `src/pages/*`

### 想看业务逻辑怎么落

1. `src/features/*/hooks`
2. `src/features/*/api`
3. `src/components/shared/*`

### 想看全局基础设施

1. `src/providers/*`
2. `src/lib/api/generated/client.ts`
3. `src/lib/api/client.ts`
4. `src/lib/store/ui-store.ts`
5. `src/i18n/index.ts`

## 验证要求

提交前至少执行：

```bash
cd apps/web
vp run api:check
vp check --fix
vp test
vp build
```

如果改动涉及工作台壳层、路由、流式问答或启动链路，额外做一次 `vp dev` 冒烟确认。
