# 架构文档

这组文档只记录仓库当前实现和长期维护约定，不记录历史任务计划，也不写理想化设计稿。这一页本身是 `docs/arch` 的导航页，目的是让你按问题进入，而不是从头到尾顺读一遍。像 `docs/superpowers/` 这类生成型目录不属于手工维护文档集合。

如果你只是想先跑起来，先看仓库根 `README.md`；如果你要接手仓库并开始开发，先看根 `README.md` 和 `CONTRIBUTING.md`；如果你只接手某一端，再补 `apps/web/README.md` 或 `apps/api/README.md`。

[系统总览](./system-overview.md) • [前端工作台](./frontend-workspace.md) • [Provider 与设置](./provider-and-settings.md) • [API 与权限边界](./api-surface-and-permissions.md) • [数据库设计](./database-design.md) • [运行时流程](./runtime-flows.md) • [仓库地图与约定](./repo-map-and-conventions.md) • [部署与运维](./deployment-and-operations.md)

## 文档导航

| 文档 | 什么时候打开 | 读完会知道什么 |
| --- | --- | --- |
| [system-overview.md](./system-overview.md) | 第一次接触仓库 | V1 目标、系统边界、核心模型、主链路和非目标 |
| [frontend-workspace.md](./frontend-workspace.md) | 需要理解 Web 工作台 | 三栏工作台、账户中枢、设置中心、页面边界、前端状态分工 |
| [provider-and-settings.md](./provider-and-settings.md) | 需要改模型配置或排查 provider | OpenAI / Anthropic / Voyage / Ollama 配置、settings API、pending embedding route、索引代际切换 |
| [api-surface-and-permissions.md](./api-surface-and-permissions.md) | 需要对接口或权限做改动 | 路由分组、角色边界、统一响应格式、幂等和流式约束 |
| [database-design.md](./database-design.md) | 需要理解 SQLite 真相源 | 表分组、主外键关系、关键约束、状态机和数据归属 |
| [runtime-flows.md](./runtime-flows.md) | 需要排查上传、问答、流式、重试、配置变更 | 启动补偿、入库回滚、同步/流式问答、索引重建、失败恢复 |
| [repo-map-and-conventions.md](./repo-map-and-conventions.md) | 需要快速定位代码和验证命令 | 仓库目录职责、代码入口、验证命令、文档同步约束 |
| [deployment-and-operations.md](./deployment-and-operations.md) | 需要跑本地、Docker 或重置数据 | Compose 拓扑、脚本职责、容器边界、重置数据与操作手册 |

## 按场景进入

### 第一次接手仓库

1. 先看根 [README.md](../../README.md)
2. 再看 [CONTRIBUTING.md](../../CONTRIBUTING.md)
3. 再看 [system-overview.md](./system-overview.md)
4. 最后看 [repo-map-and-conventions.md](./repo-map-and-conventions.md)

### 想改前端工作台

1. 先看 [frontend-workspace.md](./frontend-workspace.md)
2. 再看 [api-surface-and-permissions.md](./api-surface-and-permissions.md)

### 想改后端接口或数据层

1. 先看 [api-surface-and-permissions.md](./api-surface-and-permissions.md)
2. 再看 [database-design.md](./database-design.md)
3. 最后按需要补 [runtime-flows.md](./runtime-flows.md)

### 想改 provider、索引或设置中心

1. 先看 [provider-and-settings.md](./provider-and-settings.md)
2. 再看 [runtime-flows.md](./runtime-flows.md)
3. 最后看 [database-design.md](./database-design.md)

### 想改部署、脚本或环境变量

1. 先看 [deployment-and-operations.md](./deployment-and-operations.md)
2. 再看根 [README.md](../../README.md) 里的运行模式表
3. 最后回头检查 [repo-map-and-conventions.md](./repo-map-and-conventions.md) 里的文档同步规则

## 维护原则

- 这里写的是“当前实现真相”。代码如果已经变了，文档也必须跟着变。
- 优先把长期有效的架构信息集中放在 `docs/arch`，不要再新建一套平行说明。
- 仓库级启动主线以根 `README.md` 为准；`docs/arch` 只补长期真相，不重复维护第二套 onboarding。
- 历史设计稿或执行计划一旦完成，要把长期有效结论折叠进 `docs/arch`，不要长期保留平行目录。
- 生成型目录不算手工维护文档；如果只是工具产物，不要放进正式文档集合，也不要和 `docs/arch` 并列长期保留。
- 目录结构、运行命令、环境变量、权限边界、provider 语义、索引重建流程发生变化时，要同步更新相关页面。
- 如果某个实现已经引入了过渡态或兼容字段，文档要明确写出“谁是主语义，谁是兼容语义”，避免读者误判。
