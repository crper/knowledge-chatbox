# 仓库级执行约束

- 永远回复中文。
- 像高绩效资深工程师一样工作：直接、准确、重执行，不说空话。
- 优先选择简单、易维护、适合生产环境的方案；小功能不要过度设计。

## 先定位项目根

- 先用仓库根目录的 `justfile` 确认当前项目根；不要每轮都靠搜索目录名或反复扫全仓库。
- 默认从仓库根执行命令；需要进入子目录时再 `cd apps/web` 或 `cd apps/api`。
- 若当前目录里已经有 `justfile`、根 `AGENTS.md`、根 `README.md`，可直接视为仓库根。

## just 入口

- 仓库级常用入口优先使用 `just`，不要重复猜命令。
- 先确认 `justfile` 存在，再执行 `just --list` 或具体任务。
- 常用任务：
  - `just --list`：查看当前保留的高频入口。
  - `just init-env`：复制 `.env.example` 到 `.env`。
  - `just dev` / `just d`：前后端一起开发。
  - `just api-dev`：启动后端。
  - `just web-dev`：启动前端。
  - `just test` / `just t`：前后端检查与测试。
  - `just api-check`、`just api-test`：后端检查与测试。
  - `just web-check`、`just web-test`、`just web-build`：前端检查、测试与构建。
  - `just reset-data`、`just reset-dev`：清空本地数据，必要时同步依赖并重新进入开发态。
  - `just docker-up` / `just dc`：本地 Docker 一键启动。
  - `just docker-down`：停止并清理本地 Docker 运行态。
- 需要项目入口、可执行任务、默认工作流时，先看 `justfile`，不要自己发明命令。

## 工具链

- 前端统一使用 `Vite+` 命令：`vp dev`、`vp check --fix`、`vp test`、`vp build`。
- 不要直接使用 `pnpm`、`npm`、`yarn` 代替 `vp`。
- 后端依赖和运行统一使用 `uv`。
- 后端测试统一使用 `uv run --group dev python -m pytest`。

## 测试约束

- 优先测试用户可见行为、稳定公共契约、关键边界条件。
- 不为 class 名、间距、圆角、阴影、排版 token、DOM 包装层顺序、静态配置字面量、简单映射表写单测，除非它们承载明确业务语义或用于防止已知回归。
- 同一行为若已被更高层测试覆盖，不再补等价的低层重复测试。

## 文档同步

- 修改基础设施、运行命令、目录结构、环境变量、仓库级约束时，必须同步检查并更新：
  - 根目录 `README.md`
  - `docs/arch/system-overview.md`
  - `docs/arch/repo-map-and-conventions.md`
  - `docs/arch/deployment-and-operations.md`
  - 若涉及 provider / 设置语义，再同步 `docs/arch/provider-and-settings.md`
- 目标是让 README、架构文档和当前实现保持一致，避免未来任务被过时描述干扰。

## 实现边界

- 以 `README.md` 和 `docs/arch/*` 文档为准推进，不擅自扩展超出 V1 范围的大功能。
- 保持 API 简洁、命名清晰、行为可预测。
- 新增模型、接口、约束时，优先补测试，再做最小实现。

## 仓库结构

- `apps/web` 下若存在更细粒度 `AGENTS.md`，进入该目录后优先遵守其约束。
- 根目录约束适用于整个仓库。
