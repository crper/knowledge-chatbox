# Contributing

感谢你愿意参与 Knowledge Chatbox。

这份文档只回答三件事：接手顺序、提交前至少做什么、哪些改动必须同步文档。项目当前仍以 V1 为主，优先级始终是“简单、稳定、可维护”，不要为了小功能引入过度设计。

仓库级首次启动只有一条官方主线，以根 [README.md](./README.md) 的“快速开始”为准：

```bash
just init-env
just setup
just dev
```

## 开始前先看

- 根 [README.md](./README.md)
- [docs/arch/system-overview.md](./docs/arch/system-overview.md)
- [docs/arch/repo-map-and-conventions.md](./docs/arch/repo-map-and-conventions.md)
- 只改前端时看 [apps/web/README.md](./apps/web/README.md)
- 只改后端时看 [apps/api/README.md](./apps/api/README.md)

## 本地前置依赖

前置依赖和安装链接统一看根 [README.md](./README.md) 的“准备本地工具”一节；这里不再重复维护第二份环境准备说明。

## 首次启动

首次 clone 后，仍按根 README 的官方主线从仓库根目录执行：

```bash
just init-env
just setup
just dev
```

说明：

- `just setup` 是非破坏性的依赖安装入口
- `just dev` 只负责启动，不会自动补装前端依赖
- `just dev` 会先等 `/api/health` ready 再启动 Web；如果本机启动补偿较慢，可临时调大 `DEV_API_READY_MAX_ATTEMPTS`
- `just reset-dev` 会清空本地数据，只用于“环境已经乱掉，需要一键回到干净状态”
- 首次接手仓库时，不建议把 `just reset-dev` 当成初始化入口
- `apps/web/README.md` 和 `apps/api/README.md` 只补充包内命令，不再重复定义仓库级启动流程

如果本机默认端口被占用，可以这样启动：

```bash
API_PORT=18080 WEB_PORT=13000 just dev
```

## 常用入口

```bash
just --list
just setup
just dev
just repo-check
just test
just api-dev
just web-dev
just reset-dev
just docker-check
just docker-build
just docker-up
```

## 提交前验证

至少执行：

```bash
just repo-check
just test
```

如果你改了后端 route / schema，再额外执行：

```bash
cd apps/web
vp run api:generate
vp run api:check
```

如果你改了启动链路、环境变量、Docker、数据目录、仓库级命令，还要同步检查并更新：

- [README.md](./README.md)
- [docs/arch/system-overview.md](./docs/arch/system-overview.md)
- [docs/arch/repo-map-and-conventions.md](./docs/arch/repo-map-and-conventions.md)
- [docs/arch/deployment-and-operations.md](./docs/arch/deployment-and-operations.md)

若变更涉及 provider 或设置中心，还要同步 [docs/arch/provider-and-settings.md](./docs/arch/provider-and-settings.md)。

完整文档同步规则见 [docs/arch/repo-map-and-conventions.md](./docs/arch/repo-map-and-conventions.md) 的"文档同步规则"一节。

## 代码与测试约定

- 优先选择简单、易维护、适合生产环境的方案
- 小功能不要过度抽象，不要顺手扩成 V2
- 测试优先覆盖用户可见行为、稳定公共契约和关键边界条件
- 不为纯样式细节、DOM 包装层顺序、静态映射表补重复测试，除非它们承载明确业务语义

## 提 Issue 和 PR

- Bug 反馈请使用仓库的 Bug 模板
- 功能建议请使用 Feature Request 模板
- PR 请尽量保持单一目标，方便 review 和回滚
- 如果改动有取舍或边界，直接写在 PR 描述里，不要让 reviewer 猜
