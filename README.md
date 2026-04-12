# Knowledge Chatbox

> 本地优先的知识工作台

把"上传资料、标准化、索引、问答、来源回看、系统配置、用户管理"收进同一套单机工作流。前端使用 React + Vite+ + Base UI，后端使用 FastAPI；SQLite 保存业务真相与 `FTS5` 词法候选兜底索引，Chroma 保存向量检索派生索引，原始文件和标准化结果直接落在本地目录。

[快速开始](#快速开始) • [文档入口](#文档入口) • [开发入口](#开发入口) • [Docker 单机部署](#docker-单机部署) • [参与贡献](#参与贡献)

> [!WARNING]
> 当前项目仍处于 WIP 阶段，主要在本地 `Ollama` 环境下联调和验证功能有效性。
> Docker Compose 可以跑通，但本地机器资源占用较高；日常开发更建议直接使用 `just dev`。
> 欢迎提 Issue、开 PR，或直接参与一起完善它。

## 项目亮点

当前已落地的能力：

| 特性                 | 状态   | 说明                                                                                  |
| -------------------- | ------ | ------------------------------------------------------------------------------------- |
| 📱 响应式工作台      | 已支持 | 桌面端统一一级 `WorkspaceRail`；`/chat` 固定三栏，`/knowledge` 三栏工作台，移动端退化为抽屉和单栏 |
| 📚 多格式资料入库    | 已支持 | `txt / md / pdf / docx / png / jpg / jpeg / webp`；切块使用 chonkie Markdown 感知策略 |
| 📄 PDF 内嵌预览      | 已支持 | 资源页桌面主预览和移动端抽屉统一通过 `EmbedPDF` 内嵌加载受保护 PDF |
| 🌊 流式问答          | 已支持 | 同步问答、SSE 流式输出、失败重试、活动 run 查询与运行中主动中断；长会话主区默认只加载最近一段消息窗口 |
| 🧾 来源引用回看      | 已支持 | 回答内容带来源片段；右侧上下文栏走独立会话摘要接口，不再依赖整段消息重拉              |
| 🔎 检索兜底          | 已支持 | `Chroma` 向量召回优先，`SQLite FTS5` 负责词法候选兜底                                 |
| 🧠 三路模型路由      | 已支持 | `response / embedding / vision` 独立配置与切换                                        |
| 🤖 ChatWorkflow 后端 | 已支持 | 聊天执行当前统一由 `ChatWorkflow + PydanticAI` 驱动，同步和流式共用同一路径           |
| 🔌 多 Provider       | 已支持 | `OpenAI / Anthropic / Voyage / Ollama`                                                |
| 🧾 设置变更留痕      | 已支持 | `settings_versions` 保存脱敏设置快照与变更字段，方便追溯谁在什么时候改了什么          |
| 🌐 中英双语          | 已支持 | 前端内置 `zh-CN / en` 文案与切换能力                                                  |
| 🌓 主题切换          | 已支持 | `light / dark / system` 三种主题偏好                                                  |
| 🔐 角色与设置中心    | 已支持 | `admin / user` 两类角色，带设置中心和用户管理                                         |
| 🧭 Graph 占位工作区  | 已支持 | 一级导航预留 `/graph` 入口，当前为明确的占位页，不承诺图谱功能已落地                  |
| 🐳 单机部署          | 已支持 | 开发态可直跑，稳定运行走 Docker Compose                                               |
| 🗂️ 本地优先存储      | 已支持 | SQLite（含 `FTS5` 词法候选兜底索引）、Chroma、上传文件和标准化结果都落本地目录            |
| 🪶 依赖克制          | 已支持 | V1 不引入 Redis、Celery、对象存储等非必需基础设施                                     |

## 演示 Demo

[Bilibili: v1](https://www.bilibili.com/video/BV1RCQQBvEKb/?vd_source=c217126ec335b1b5117485606ac9594f)

## 快速开始

### 0. 唯一官方开发主线

首次 clone 或依赖刚更新时，统一从仓库根目录执行：

```bash
just init-env
just setup
just dev
```

说明：

- 这条路径是仓库唯一官方开发主线
- `apps/web/README.md` 和 `apps/api/README.md` 只补充各自包内命令，不再重复定义仓库级启动流程
- `just` 默认会打印一份精简过的高频入口清单；如果要看完整命令面，执行 `just --list`
- `just dev` 会先拉起 API，等 `/api/health` ready 后再启动 Web，并在终端统一打印 Web / API 的访问地址，以及 bootstrap 管理员账号提示；若覆盖了 `API_PORT` / `WEB_PORT`，这里显示的链接也会同步变化
- 默认会给 API 约 60 秒完成启动补偿；如果你的机器更慢，可临时调大 `DEV_API_READY_MAX_ATTEMPTS` 后再执行 `just dev`
- 前端开发态默认建议把 `VITE_API_BASE_URL` 留空，统一走同源 `/api`；`vp dev` 会通过 Vite proxy 转发到当前 `API_PORT` 对应的本机 API（默认 `8000`）
- 如果你只想先理解接手顺序和提交前要求，再看 [CONTRIBUTING.md](./CONTRIBUTING.md)

### 1. 准备本地工具

首次接手仓库前，请先确保本机已有这些命令：

- `just`
- `uv`
- `vp`
- Python `3.12`
- Node.js

说明：

- `just` 负责仓库级命令入口
- `uv` 负责后端依赖与 Python 运行
- `vp` 负责前端 Vite+ 工具链；如果本机还没有，可先看官方安装文档：[viteplus.dev/guide/install](https://viteplus.dev/guide/install)
- 前端运行时版本以 [apps/web/.node-version](./apps/web/.node-version) 为准；当前仓库固定为 `24.14.1`，避免 `vp` 每次按 `lts` 远端解析时受外网波动影响
- `just` 和 `uv` 如果本机尚未安装，请先按各自官方文档完成安装

### 2. 初始化环境

```bash
just init-env
# 或
cp .env.example .env
```

默认 `.env.example` 会在数据库里还没有管理员时初始化一个管理员账号：

- 用户名：`admin`
- 密码：如果当前数据库里还没有管理员，需要在 `.env` 中设置 `INITIAL_ADMIN_PASSWORD`（至少 8 字符，包含大写字母、小写字母、数字、特殊字符中的至少 3 类）。执行 `just init-env` 会自动生成
- `just init-env` 完成后会直接提示 `.env` 路径；如果忘了登录密码，直接查看同一个文件里的 `INITIAL_ADMIN_PASSWORD`

### 3. 安装依赖

```bash
just setup
```

说明：

- 首次 clone 后必须先执行一次
- 后端会执行 `uv sync --all-groups`
- 前端会执行 `vp install`
- `just dev` 专注于启动服务，不会自动安装依赖；推荐先执行 `just setup` 再运行 `just dev`
- `.env.example` 当前默认把 `response / embedding / vision` bootstrap 都指向本机 Ollama，并把 `INITIAL_OLLAMA_BASE_URL` 设为 `http://localhost:11434`
- 如果改走 Docker Compose，且 Ollama 仍跑在宿主机，请把 `.env` 里的 `INITIAL_OLLAMA_BASE_URL` 改成 `http://host.docker.internal:11434`

### 4. 常用命令

| 目标               | 命令               | 说明                                                                                               |
| ------------------ | ------------------ | -------------------------------------------------------------------------------------------------- |
| 本地开发           | `just dev`         | 启动 API 和 Web 开发服务                                                                           |
| 检查与测试         | `just test`        | 执行仓库检查、后端静态检查与测试、前端静态检查与测试                                                 |
| 重置本地数据       | `just reset-dev`   | 清空数据、重装依赖、重启开发环境（用于环境混乱时）                                                   |
| 单机部署           | `just docker-up`   | Docker Compose 运行                                                                                |
| 查看全部命令       | `just --list`      | 查看完整命令列表                                                                                   |

> 详细命令说明见 [docs/arch/deployment-and-operations.md](./docs/arch/deployment-and-operations.md)

### 5. 打开服务

执行 `just dev` 或 `just reset-dev` 后，终端会打印以下默认地址：

- Web: `http://localhost:3000`
- API health: `http://localhost:8000/api/health`
- API docs: `http://localhost:8000/docs`
- API redoc: `http://localhost:8000/redoc`
- OpenAPI JSON: `http://localhost:8000/openapi.json`

## 文档入口

| 想做什么                        | 先看哪里                                                                           |
| ------------------------------- | ---------------------------------------------------------------------------------- |
| 第一次接手仓库并准备开发        | [CONTRIBUTING.md](./CONTRIBUTING.md)                                               |
| 只想先跑起来                    | [快速开始](#快速开始)                                                              |
| 想先看架构文档导航              | [docs/arch/README.md](./docs/arch/README.md)                                       |
| 想理解登录 / 会话恢复 / refresh | [docs/arch/auth-and-session-flow.md](./docs/arch/auth-and-session-flow.md)         |
| 只改前端                        | [apps/web/README.md](./apps/web/README.md)                                         |
| 只改后端                        | [apps/api/README.md](./apps/api/README.md)                                         |
| 理解系统边界                    | [docs/arch/system-overview.md](./docs/arch/system-overview.md)                     |
| 看 provider / 设置语义          | [docs/arch/provider-and-settings.md](./docs/arch/provider-and-settings.md)         |
| 看部署和运维                    | [docs/arch/deployment-and-operations.md](./docs/arch/deployment-and-operations.md) |

## 开发入口

- 前端在 `apps/web`，统一使用 `vp`；当前前端 URL 契约已经收敛到 TanStack Router file-based routes，页面组件默认只消费 canonical path。如果改了后端 route / schema，先执行 `vp run api:generate`。详细命令见 [apps/web/README.md](./apps/web/README.md)。
- 前端开发态当前会自动挂载 TanStack Devtools 聚合面板，统一查看 Query / Router / Form 状态；它只在 `vp dev` 下生效，不进入生产构建。
- 后端在 `apps/api`，统一使用 `uv`。详细命令见 [apps/api/README.md](./apps/api/README.md)。
- 模型设置里的 `Ollama Base URL` 只填写服务根地址，例如 `http://localhost:11434`；系统内部会自动派生兼容接口路径，不需要手动补 `/v1`。

## Docker 单机部署

```bash
just init-env
just docker-up
```

关键说明：

- `just init-env` 是显式前置步骤，Docker 相关入口不再静默帮你生成 `.env`
- `just docker-up` 会在启动前自动重建当前工作区对应镜像
- Docker 单机模式里，`web` 容器会把同源 `/api` 反代到 `api` 服务

> 完整部署说明、容器拓扑、运维脚本和故障排查见 [docs/arch/deployment-and-operations.md](./docs/arch/deployment-and-operations.md)

## 手工验证样例

仓库内置了 4 个可直接上传的样例文件，位于 `examples/upload-samples/`：

| 文件                        | 类型     | 可以用来问什么                                         |
| --------------------------- | -------- | ------------------------------------------------------ |
| `01-night-voyage.txt`       | TXT      | 哪个文件写到“云层背面也有路标”？                       |
| `02-south-window.md`        | Markdown | 哪篇文章提到“折页里藏着一枚迟到的晴天”？               |
| `03-tide-reading-list.pdf`  | PDF      | 哪份 PDF 写到“海风把借阅证吹成了一片小帆”？            |
| `04-brick-lane-letter.docx` | DOCX     | 哪份 DOCX 里出现“北窗下那只琥珀色风标总在无风时轻响”？ |

这些样例主要用于手工验证“上传 -> 标准化 -> 索引 -> 问答引用”这条链路是否正常。

## 仓库结构

```text
knowledge-chatbox/
  apps/
    web/               # React + Vite+ 前端
      README.md        # 前端工程说明
    api/               # FastAPI 后端
      README.md        # 后端工程说明
  docs/
    arch/              # 手工维护的架构、接口、链路、部署文档
  examples/
    upload-samples/    # 上传与检索手工验证样例
  data/
    uploads/           # 原始上传文件
    normalized/        # 标准化后的文本 / Markdown
    chroma/            # Chroma 向量索引数据
    sqlite/            # SQLite 业务数据与 FTS5 词法候选兜底索引
  scripts/
    api-entrypoint.sh
    check_repo_surface.py
    dev-run.sh
    docker-deploy.sh
    export_openapi.py
    reset-local-data.sh
    lib/
  justfile
  .env.example
  docker-compose.yml
```

## 已知边界

- 当前仍是 V1，优先保证整条链路可用、代码可维护，不追求大而全
- 不做 Redis / Celery / MinIO / Qdrant 这类重基础设施
- 当前每个用户只有一个 personal `space`
- 图片入库支持 provider 视觉解析；如果当前 provider 不支持，也会退化成保留基础文件信息
- `docx` 当前以正文、标题、顶层列表和顶层表格抽取为主，不做高保真版式重建

## 开发约束

- 修改基础设施、运行命令、目录结构或环境变量时，要同步更新根目录 README 和相关 `docs/arch/*` 文档
- 前端统一使用 `vp`
- 后端统一使用 `uv`
- GitHub Actions 当前固定执行 `api / web / repo-surface` 三条检查；`web` 的 OpenAPI 校验依赖仓库内已提交的 `apps/web/openapi/schema.json` 与 `apps/web/src/lib/api/generated/schema.d.ts`
- Dependabot 仅对通过 CI 的 `patch / minor` 更新自动审批并开启自动合并，`major` 更新继续人工 review
- 小功能优先简单、稳定、可维护，不提前引入超出 V1 范围的大型抽象

## 参与贡献

- 提交前先看 [CONTRIBUTING.md](./CONTRIBUTING.md)
- Bug 反馈使用仓库里的 Bug Issue 模板
- 功能建议使用 Feature Request 模板
- License 见 [LICENSE](./LICENSE)
