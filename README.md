# Knowledge Chatbox

> 本地优先的知识工作台

把“上传资料、标准化、索引、问答、来源回看、系统配置、用户管理”收进同一套单机工作流。前端使用 React + Vite+，后端使用 FastAPI；SQLite 保存业务真相，Chroma 保存检索派生索引，原始文件和标准化结果直接落在本地目录。

[快速开始](#快速开始) • [文档入口](#文档入口) • [开发入口](#开发入口) • [Docker 单机部署](#docker-单机部署) • [参与贡献](#参与贡献)

> [!WARNING]
> 当前项目仍处于 WIP 阶段，主要在本地 `Ollama qwen3.5:4b` 环境下联调和验证功能有效性。
> Docker Compose 可以跑通，但本地机器资源占用较高；日常开发更建议直接使用 `just dev`。
> 欢迎提 Issue、开 PR，或直接参与一起完善它。

## 项目亮点

当前已落地的能力：

| 特性 | 状态 | 说明 |
| --- | --- | --- |
| 📱 响应式工作台 | 已支持 | `/chat` 桌面端三栏，移动端退化为抽屉和单栏 |
| 📚 多格式资料入库 | 已支持 | `txt / md / pdf / docx / png / jpg / jpeg / webp` |
| 🌊 流式问答 | 已支持 | 同步问答、SSE 流式输出、失败重试、活动 run 查询 |
| 🧾 来源引用回看 | 已支持 | 回答内容带来源片段，支持回溯引用上下文 |
| 🧠 三路模型路由 | 已支持 | `response / embedding / vision` 独立配置与切换 |
| 🔌 多 Provider | 已支持 | `OpenAI / Anthropic / Voyage / Ollama` |
| 🌐 中英双语 | 已支持 | 前端内置 `zh-CN / en` 文案与切换能力 |
| 🌓 主题切换 | 已支持 | `light / dark / system` 三种主题偏好 |
| 🔐 角色与设置中心 | 已支持 | `admin / user` 两类角色，带设置中心和用户管理 |
| 🐳 单机部署 | 已支持 | 开发态可直跑，稳定运行走 Docker Compose |
| 🗂️ 本地优先存储 | 已支持 | SQLite、Chroma、上传文件和标准化结果都落本地目录 |
| 🪶 依赖克制 | 已支持 | V1 不引入 Redis、Celery、对象存储等非必需基础设施 |

## 演示 Demo
[Bilibili: v1](https://www.bilibili.com/video/BV1RCQQBvEKb/?vd_source=c217126ec335b1b5117485606ac9594f)

## 快速开始

### 0. 准备本地工具

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
- `just` 和 `uv` 如果本机尚未安装，请先按各自官方文档完成安装

### 1. 初始化环境

```bash
just init-env
# 或
cp .env.example .env
```

默认 `.env.example` 会在数据库里还没有管理员时初始化一个管理员账号：

- 用户名：`admin`
- 密码：`admin123456`

### 2. 安装依赖

```bash
just setup
```

说明：

- 首次 clone 后必须先执行一次
- 后端会执行 `uv sync --all-groups`
- 前端会执行 `vp install`
- `just dev` 默认假定依赖已经装好；如果直接在 fresh clone 上运行，前端会因为缺少本地依赖而启动失败

### 3. 选择运行方式

| 目标 | 命令 | 说明 |
| --- | --- | --- |
| 首次安装依赖 | `just setup` | 同步后端虚拟环境和前端依赖 |
| 看仓库入口 | `just --list` | 查看当前保留的高频命令 |
| 本地开发 | `just dev` | 依赖已安装后启动前后端 |
| 只跑后端 | `just api-dev` | FastAPI 开发态 |
| 只跑前端 | `just web-dev` | Web 开发态 |
| 检查与测试 | `just test` | 前后端检查与测试 |
| 重置本地数据 | `just reset-dev` | 清空数据、同步依赖并重新拉起 |
| 单机部署 | `just docker-up` | Docker Compose 运行 |

`just reset-dev` 会清空本地数据，只适合“环境已经乱掉，需要一键回到干净状态”的场景，不作为首次启动入口。

### 4. 打开服务

- Web: `http://localhost:3000`
- API health: `http://localhost:8000/api/health`
- API docs: `http://localhost:8000/docs`
- API redoc: `http://localhost:8000/redoc`
- OpenAPI JSON: `http://localhost:8000/openapi.json`

## 文档入口

| 想做什么 | 先看哪里 |
| --- | --- |
| 第一次接手仓库 | [docs/arch/README.md](./docs/arch/README.md) |
| 只想先跑起来 | [快速开始](#快速开始) |
| 只改前端 | [apps/web/README.md](./apps/web/README.md) |
| 只改后端 | [apps/api/README.md](./apps/api/README.md) |
| 理解系统边界 | [docs/arch/system-overview.md](./docs/arch/system-overview.md) |
| 看 provider / 设置语义 | [docs/arch/provider-and-settings.md](./docs/arch/provider-and-settings.md) |
| 看部署和运维 | [docs/arch/deployment-and-operations.md](./docs/arch/deployment-and-operations.md) |

## 开发入口

- 前端在 `apps/web`，统一使用 `vp`；如果改了后端 route / schema，先执行 `vp run api:generate`。详细命令见 [apps/web/README.md](./apps/web/README.md)。
- 后端在 `apps/api`，统一使用 `uv`。详细命令见 [apps/api/README.md](./apps/api/README.md)。

## Docker 单机部署

```bash
just init-env
just docker-check
just docker-build
just docker-up
just docker-ps
just docker-logs api
just docker-health
just docker-down
```

说明：

- `just init-env` 是显式前置步骤，Docker 相关入口不再静默帮你生成 `.env`
- `just docker-check` 只做 Compose 和 `.env` 静态校验，不要求 Docker daemon 已启动
- Docker 单机模式里，`web` 容器会把同源 `/api` 反代到 `api` 服务，避免 refresh cookie / 文件预览落到跨源链路
- Docker 单机模式里，`web` 容器的 Nginx 已把单次请求体上限放宽到 `2GB`，避免大 PDF 被默认 `413 Payload Too Large` 提前拦截
- `just docker-up` 默认复用当前镜像；首次启动、改了 Dockerfile / lockfile，或改了前端构建期 API 地址时，先执行 `just docker-build`

更细的容器拓扑、部署脚本、副作用和重置 runbook 见 [docs/arch/deployment-and-operations.md](./docs/arch/deployment-and-operations.md)。

## 手工验证样例

仓库内置了 4 个可直接上传的样例文件，位于 `examples/upload-samples/`：

| 文件 | 类型 | 可以用来问什么 |
| --- | --- | --- |
| `01-night-voyage.txt` | TXT | 哪个文件写到“云层背面也有路标”？ |
| `02-south-window.md` | Markdown | 哪篇文章提到“折页里藏着一枚迟到的晴天”？ |
| `03-tide-reading-list.pdf` | PDF | 哪份 PDF 写到“海风把借阅证吹成了一片小帆”？ |
| `04-brick-lane-letter.docx` | DOCX | 哪份 DOCX 里出现“北窗下那只琥珀色风标总在无风时轻响”？ |

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
    sqlite/            # SQLite 数据文件
  scripts/
    docker-deploy.sh
  reset-local-data.sh
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
- 小功能优先简单、稳定、可维护，不提前引入超出 V1 范围的大型抽象

## 参与贡献

- 提交前先看 [CONTRIBUTING.md](./CONTRIBUTING.md)
- Bug 反馈使用仓库里的 Bug Issue 模板
- 功能建议使用 Feature Request 模板
- License 见 [LICENSE](./LICENSE)
