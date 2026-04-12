# Contributing

感谢你愿意参与 Knowledge Chatbox。

这份文档回答三件事：接手顺序、提交前至少做什么、哪些改动必须同步文档。项目当前以 V1 为主，优先级始终是"简单、稳定、可维护"。

## 开始前先看

1. 根 [README.md](./README.md) - 快速开始和项目概览
2. [docs/arch/system-overview.md](./docs/arch/system-overview.md) - 系统架构和边界
3. [docs/arch/repo-map-and-conventions.md](./docs/arch/repo-map-and-conventions.md) - 代码结构和约定
4. 只改前端时看 [apps/web/README.md](./apps/web/README.md)
5. 只改后端时看 [apps/api/README.md](./apps/api/README.md)

## 首次启动

```bash
just init-env
just setup
just dev
```

> 详细说明见根 [README.md](./README.md)"快速开始"章节。

## 常用入口

```bash
just dev          # 启动开发环境
just test         # 执行检查与测试
just reset-dev    # 重置数据并重启
just docker-up    # Docker 部署
just --list       # 查看全部命令
```

## 提交前验证

```bash
just repo-check   # 仓库表面约束检查
just test         # 执行全部测试
```

如果你改了后端 route / schema，再额外执行：

```bash
cd apps/web
vp run api:generate
vp run api:check
```

## 文档同步规则

以下改动必须同步更新文档：

| 改动类型 | 必须同步的文档 |
|----------|----------------|
| 启动链路、环境变量、Docker、数据目录、仓库级命令 | README.md, system-overview.md, repo-map-and-conventions.md, deployment-and-operations.md |
| provider 或设置中心 | provider-and-settings.md |

完整规则见 [repo-map-and-conventions.md](./docs/arch/repo-map-and-conventions.md)"文档同步规则"一节。

## 代码与测试约定

- 优先选择简单、易维护、适合生产环境的方案
- 小功能不要过度抽象
- 测试优先覆盖用户可见行为、稳定公共契约和关键边界条件
- 不为纯样式细节、DOM 包装层顺序、静态映射表补重复测试

## 提 Issue 和 PR

- Bug 反馈请使用仓库的 Bug 模板
- 功能建议请使用 Feature Request 模板
- PR 请尽量保持单一目标，方便 review 和回滚
- 如果改动有取舍或边界，直接写在 PR 描述里
