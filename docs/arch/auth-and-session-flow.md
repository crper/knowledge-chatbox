# 认证与会话流程

这份文档专门描述 `Knowledge Chatbox` 当前的登录、启动恢复、`401 -> refresh -> retry`、以及改密后强制重新登录语义。之所以单独成文，是因为这些规则同时横跨前端路由守卫、前端请求封装、后端 cookie / token 接口和部署配置。

配套阅读：

- [api-surface-and-permissions.md](./api-surface-and-permissions.md)
- [frontend-workspace.md](./frontend-workspace.md)
- [runtime-flows.md](./runtime-flows.md)
- [deployment-and-operations.md](./deployment-and-operations.md)

## 1. 设计目标

- access token 只保存在前端内存，不落 `localStorage`
- refresh session 继续以服务端 `auth_sessions` + HttpOnly cookie 为真相源
- 匿名态是正常状态，不应该在登录页首屏探测里表现成控制台错误
- 启动期恢复和业务请求续期分开：
  - 启动期看 `/api/auth/bootstrap`
  - 业务请求里的 `401` 看 `/api/auth/refresh`
- 改密后当前登录状态立即失效，必须重新登录

## 2. 接口分工

### `POST /api/auth/login`

- 校验用户名和密码
- 返回短期 bearer `access token`（JWT 格式，默认有效期 15 分钟）
- 同时写入新的 refresh session cookie（HttpOnly，服务端随机字符串，有效期与 access token 一致）

### Token 格式说明

- **access token**: JWT (JSON Web Token)，使用 HS256 算法签名，包含 `sub` (用户 ID)、`exp` (过期时间) 等 claims，只保存在前端内存
- **refresh session**: 服务端生成的随机字符串，通过 `auth_sessions` 表管理，以 HttpOnly cookie 形式存储在浏览器，前端无法读取

### `POST /api/auth/bootstrap`

- 启动期专用恢复接口
- 读取当前 refresh session cookie
- 若 cookie 缺失、无效、已过期或对应用户不可用：
  - 返回 `200`
  - `authenticated = false`
  - 不把匿名态当成异常
- 若 cookie 有效：
  - 保持当前 refresh session 不变
  - 返回新的 bearer `access token`
  - 同时返回当前用户

### `POST /api/auth/refresh`

- 业务请求专用的续期接口
- 当前端已经认为用户处于登录态，但单个受保护请求拿到 `401` 时调用
- 成功则轮换 refresh session 并返回新的 bearer `access token`
- 失败则前端清空 access token，并把会话状态标记为 `expired`

### `GET /api/auth/me`

- 当前是纯读接口
- 只接受 bearer access token
- 不再承担会话心跳或写库副作用

## 3. 前端启动时序

### 场景 A：匿名用户直接打开 `/login`

```text
Browser
  -> AppBootstrapGate
  -> POST /api/auth/bootstrap
API
  -> no session cookie / invalid session
  -> 200 { authenticated: false }
Browser
  -> session status = anonymous
  -> render /login
```

关键点：

- 这是正常分支，不是异常
- 不再通过 `/api/auth/refresh -> 401` 判断匿名态

### 场景 B：已有 refresh cookie，直接打开 `/login`

```text
Browser
  -> AppBootstrapGate
  -> POST /api/auth/bootstrap
API
  -> validate refresh session
  -> issue new access token
  -> 200 { authenticated: true, access_token, user }
Browser
  -> set in-memory access token
  -> session status = authenticated
  -> PublicRoute redirect -> /chat
```

关键点：

- `/login` 仍然能自动恢复已有会话
- 但匿名态不会再制造错误级控制台噪音
- 启动探测本身不轮换 refresh session，避免多标签或频繁首屏打开时制造不必要的竞争

### 场景 C：已有 access token，打开受保护页

```text
Browser
  -> bootstrapSession()
  -> skip /bootstrap
  -> GET /api/auth/me with bearer token
API
  -> return current user
Browser
  -> session status = authenticated
  -> render protected route
```

## 4. 业务请求里的 `401 -> refresh -> retry`

```text
Protected fetch
  -> send request with bearer access token
  -> receives 401
  -> single-flight POST /api/auth/refresh
  -> if refresh succeeds:
       - update in-memory access token
       - replay original request once
  -> if refresh fails:
       - clear in-memory access token
       - session status = expired
```

关键约束：

- 只对业务请求做这套续期
- `/api/auth/login`、`/api/auth/logout`、`/api/auth/refresh` 自己不会再触发 refresh
- 上传、普通 JSON 请求、SSE 流式聊天共享这套规则

## 5. 改密后的重新登录

```text
User submits change password
  -> API verifies current password
  -> API updates password hash
  -> API revokes all refresh sessions for that user
  -> API returns success and clears cookie
Browser
  -> clears current user cache
  -> session status = expired
  -> redirect to /login
```

关键点：

- 改密不是“下次生效”，而是当前登录状态立即失效
- 旧 access token 会因为 `password_changed_at` 检查失效

## 6. 控制台噪音与错误分级

当前约束：

- 匿名态启动探测不应该制造错误级控制台日志
- 真正值得当异常处理的是：
  - `/api/auth/bootstrap` 返回 `5xx`
  - `/api/auth/refresh` 在登录态续期中失败
  - `/api/auth/me` 在已有 access token 时异常失败

这也是为什么：

- 登录页匿名态走 `/api/auth/bootstrap`
- 业务请求续期继续走 `/api/auth/refresh`

## 7. 部署注意事项

- refresh cookie 默认按请求 scheme 自动决定是否带 `Secure`
- 如果 HTTPS 终止在反向代理，而应用层拿不到 `https` scheme，需要显式配置 `SESSION_COOKIE_SECURE=true`
- 单机 Docker 模式下，前端走同源 `/api` 反代，避免 refresh cookie 落到跨源链路

## 8. 关键代码入口

- 前端：
  - `apps/web/src/lib/auth/session-manager.ts`
  - `apps/web/src/lib/api/authenticated-fetch.ts`
  - `apps/web/src/router/bootstrap-gate.tsx`
  - `apps/web/src/router/route-shells.tsx`
  - `apps/web/src/routes/*`
  - `apps/web/src/features/auth/api/auth.ts`
- 后端：
  - `apps/api/src/knowledge_chatbox_api/api/routes/auth.py`
  - `apps/api/src/knowledge_chatbox_api/services/auth/auth_service.py`
  - `apps/api/src/knowledge_chatbox_api/models/auth.py`
