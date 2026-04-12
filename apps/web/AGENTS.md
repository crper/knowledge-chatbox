<!--VITE PLUS START-->

# 前端执行约束

本目录约束优先级高于根 `AGENTS.md`；根目录通用约束仍适用。

## Vite+ 工具链

`vp` 是统一 CLI，封装 Vite + Rolldown + Vitest + Oxlint + Oxfmt。

- 常用命令：`vp dev` / `vp check --fix` / `vp test` / `vp build` / `vp install`。
- 禁止直接使用 `pnpm`、`npm`、`yarn`；禁止单独安装 `vitest`、`oxlint`、`oxfmt`、`tsdown`。
- 禁止运行 `vp vitest` 或 `vp oxlint`，用 `vp test` 和 `vp lint` 代替。
- Import 来源统一为 `vite-plus`：`import { defineConfig } from 'vite-plus'`、`import { expect, test, vi } from 'vite-plus/test'`。
- `vp` 命令优先于 `package.json` scripts；如需运行同名 script，用 `vp run <name>`。

## 路径与别名

- 唯一路径别名：`@/` → `src/`（tsconfig + vite resolve.alias 同步配置）。
- 所有模块引用统一用 `@/` 前缀，禁止相对路径跨目录引用。

## 组件约定

- 基础交互组件基于 `Base UI` 组装，优先使用 `render` prop，禁止新增 `asChild` 或重新引入 `radix-ui`。
- 路由基于 TanStack Router file-based routes（`autoCodeSplitting`），禁止引入 `react-router-dom`。

## 样式

- Tailwind CSS v4 + shadcn/ui CSS 变量主题，无 `tailwind.config` 文件。
- Dark mode 通过 `.dark` class 切换（`@custom-variant dark`）。
- 使用项目定义的 surface token（`surface-panel` / `surface-floating` / `surface-elevated` 等）和排版 token（`text-ui-display` / `text-ui-heading` / `text-ui-body` 等），禁止硬编码颜色或字号。

## API 层

- 类型真相源：`src/lib/api/generated/schema.d.ts`，由 `vp run api:generate` 从 OpenAPI 生成，禁止手写。
- 请求走 `openapi-fetch` typed client + `openapiRequestRequired<T>()` 解包 Envelope，禁止手写 `fetch` 或引入 `axios`。
- 查询键集中在 `src/lib/api/query-keys.ts`，按领域分组，带参数的用函数工厂。
- 认证请求通过 `authenticatedFetch`（自动注入 token + 401 刷新重放）。

## 测试

- MSW 工具：`createTestServer(options?)` 重置全局状态，`overrideHandler(handler)` 覆盖单个接口。
- Mock 响应：`apiResponse(data)` / `apiError(error, init?)`，禁止使用已废弃的 `jsonResponse` / `apiSuccessResponse` / `apiErrorResponse` / `stubFetch` / `createAuthFetchMock`。
- 测试数据用 fixture 工厂（`buildAppUser` / `buildAppSettings` / `buildProviderConnectionResult`），禁止手写大段 JSON。
- 页面级测试用 `renderRoute("/path")`，组件级测试用 `render(<Component />)`；只需 path/params 上下文的组件用 `TestRouter`。
- 测试 import 从 `vite-plus/test` 引入。

<!--VITE PLUS END-->
