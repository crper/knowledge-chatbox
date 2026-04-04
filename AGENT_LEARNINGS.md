# AGENT_LEARNINGS

## 2026-04-04

- 错误
  - 看到 `ollama` 的导入副作用后，第一反应是把 `from ollama import Client` 改成 `from ollama._client import Client`，但 Python 载入子模块前仍会先执行包级 `__init__.py`，结果还是触发了 `ollama` 默认 `_client = Client()` 的副作用。
  - 只修了业务代码里的 `ollama` 顶层导入，却漏了测试文件里对 `from ollama import ResponseError` 的直接依赖，导致后端全量 `pytest` 仍会在收集阶段被同一个代理环境问题打断。
  - 运行 `uv` 相关命令时没有盯住 lockfile，结果本机镜像源把 `apps/api/uv.lock` 整体改写成阿里云源 URL，差点把无关噪音一起混进任务改动。
- 应避免的模式
  - 以为“改成子模块导入”就天然绕开第三方包的包级初始化，不先看 site-packages 里的 `__init__.py`。
  - 只修生产代码，不把同类导入模式在测试、脚本和 helper 里一起扫一遍。
  - 跑依赖工具链命令后不检查 lockfile / snapshot 是否被环境配置顺手改脏。
- 更好的方法
  - 对可疑三方包先直接读它在虚拟环境里的 `__init__.py`，确认包级有没有全局 client / network / env side effect，再决定是懒导入、局部导入，还是在导入瞬间临时屏蔽环境变量。
  - 给这类问题补一个 subprocess 级回归测试，直接验证“在带代理环境变量时 import 也不会炸”，这样后续重构很难再把问题带回来。
  - 身份切换相关改动不要只改 `auth.me`；登录、登出、会话恢复、密码变更后，要统一清掉 React Query 业务缓存、聊天本地草稿/附件、流式 run 状态和最近访问会话 ID，避免跨身份数据闪现。
  - 对本地优先 provider client，优先显式设置 `trust_env=False`，不要让 shell 里的代理变量偷偷改变请求路径或把测试环境搞成随机失败。
  - 跑完 `uv` / 依赖命令后顺手看一眼 `git diff --stat`，发现 lockfile 或 snapshot 被环境副作用改动时，立刻恢复到 `HEAD`，别把无关变更拖进任务里。

## 2026-04-03

- 错误
  - 在前端配置里把“开发态优先走同源 `/api` 代理”直接挂到 `import.meta.env.DEV` 上，忘了 Vitest 也会把 `DEV` 视为真，结果把整批 API 单测的 URL 语义一起改掉，前端测试瞬间连锁爆红。
  - 在重构派生状态时，直接按旧快照给 `provider-form-state.ts` 打大块补丁，结果因为前一轮改动后上下文已经漂移，`apply_patch` 校验失败。
  - 给 TypeScript 判别联合加事件表后，直接返回 `{ event: union, data: union }`，以为 TS 会自动还原成对应联合成员，结果 parser 和测试里的 `data.delta` 都报类型错误。
  - 判断事件名是否在 `Set` 里时顺手写成了 `value in set`，把对象属性判断和集合成员判断混了。
  - 抽 SSE 测试 helper 时，只保留了“无空白行结尾”的 frame 语义，漏掉原测试故意把事件分隔空行拆成独立 chunk 的场景，导致两个事件被 parser 粘成一个 JSON。
  - 在 Python 3.12 项目里给类型别名还写 `TypeAlias = ...`，ruff 会要求直接用 `type Xxx = ...`。
  - 把 `list[tuple[str, dict]]` 传给期望 `list[SpecificAlias]` 的函数，忘了 `list` 不变型，basedpyright 会直接拦。
  - 单跑 `markdown-message` 和 `message-list` 都是绿的，就默认富渲染 lazy chunk 没问题；结果全量 `just test` 并发起来后，dynamic import 比默认 `waitFor` 1 秒更慢，两个断言一起假红。
- 应避免的模式
  - 想让浏览器开发态优先走代理时，只看 `import.meta.env.DEV`，不区分真实浏览器开发态和 Vitest / jsdom 测试态。
  - 连续几轮都在改同一个文件时，还按第一次读到的长片段一次性下大补丁。
  - 处理判别联合时，指望“字段都是对的”就能让 TS 自动把对象字面量识别成联合成员。
  - 写集合判断时脑内把 `Set` 当普通对象用。
  - 抽流式协议测试 helper 时，只对比最终字符串长得像，不核对 chunk 边界和事件分隔语义。
  - 在已经切到 Python 3.12+ 的仓库里，继续沿用旧式 `TypeAlias` 语法。
  - 给函数参数收窄成 alias 后，还沿用更宽的 `list[...]` 注解，指望类型系统自动协变。
  - 只单跑相关测试文件，不补一次全量套件，就对 lazy import + waitFor 的时序稳定性下结论。
- 更好的方法
  - 这类“开发态特殊语义”优先写成显式开关，例如 `import.meta.env.DEV && !import.meta.env.VITEST`；浏览器开发态和测试态要分开，不要让测试夹具跟着吃产品默认值变化。
  - 先用 `nl -ba` 或 `sed` 重新读目标片段，再按函数或段落级别拆小补丁。
  - 对 runtime 事件名这类 union，先补一个泛型构造 helper，把 `event -> data` 的映射显式绑定，再让 parser 统一走这个 helper。
  - `Set` 一律用 `.has()`，不要写 `in`；如果是对象 key 判断，再用 `in` 或 `Object.hasOwn()`。
  - 给 SSE / streaming helper 抽象时，先列清楚“完整 frame”“无尾部空行”“把空白分隔符拆成独立 chunk”这几类语义，再对照原测试逐个替换。
  - Python 类型收口前先看仓库 lint 规则；3.12 项目默认优先用 `type` 关键字声明 alias。
  - 需要把事件 tuple 列表传进强类型函数时，直接把局部变量注解成最终 alias，或者把函数参数放宽到 `Sequence`。
  - 只要 UI 测试依赖 lazy chunk 真正落地，就把等待窗口显式写出来，或者先预热模块；单跑通过不代表整套并发跑也稳。

## 2026-04-02

- 错误
  - 用 `apply_patch` 改组件时直接带大段旧上下文，结果因为前面测试改动后行块不完全匹配，补丁校验失败。
  - 在 `jsdom` 里直接 `vi.spyOn(window.location, "replace")`，命中了不可重定义属性，测试还没到行为断言就先炸了。
  - 想在 React 的 `setState` 函数式 updater 里顺手写入外层局部变量，再立刻拿这个变量排队后续上传，结果 updater 不保证同步执行，第一次重试直接被自己吞掉。
  - 在带多个 Virtuoso 区域的页面里，浏览器里直接抓第一个 `virtuoso-item-list` 做宽度判断，误命中了左侧会话列表而不是聊天消息区。
  - SQLite 开了 WAL 后，重置脚本只删主库 `ai_qa.db` 没删 `ai_qa.db-wal` / `ai_qa.db-shm`，重建数据库后启动直接炸成 `disk I/O error`。
- 应避免的模式
  - 在连续改测试和实现后，继续依赖第一次读到的长上下文一次性打大补丁。
  - 需要拦截浏览器导航时，直接对 `window.location` 实例方法做 `spyOn`。
  - 指望 `setState((prev) => { ... })` 在当前调用栈里同步产出可复用的副作用值。
  - 在复杂工作台页面里，只按通用 `data-testid="virtuoso-item-list"` 全局取第一个节点就下结论。
  - 任何启用了 SQLite WAL 的本地重置脚本，只删除 `.db` 本体就算完成。
- 更好的方法
  - 先用 `sed` 重新读取目标片段，再按更小的块分段 `apply_patch`。
  - UI 调整里优先先锁测试，再精确读取当前实现，能明显减少补丁上下文漂移。
  - 对导航方法优先 mock `Location.prototype.replace` / `Location.prototype.assign`，或者抽一层可注入 helper，别直接碰实例属性。
  - 这类“防连点 / 防重复排队”场景，优先用 `ref` 或显式状态记录已入队 id，再让 UI 状态和队列消费各自独立推进。
  - 先用更稳定的父容器缩小范围，例如聊天区的 `chat-message-viewport-scroll`，再看对应 `virtuoso-item-list` 的 `scrollWidth/clientWidth`。
  - 对 SQLite runtime reset，主库、`-wal`、`-shm` 要一起删；最小回归测试直接跑脚本并断言三个文件都不存在。

## 2026-03-31

- 错误
  - 在大型页面测试文件里直接使用 fake timer 验证 React Query 轮询，导致同文件后续用例一起超时，失败信号不干净。
- 应避免的模式
  - 为了验证轮询行为，优先在已有大而重的页面集成测试里直接接管全局计时器。
- 更好的方法
  - 先把轮询条件收口到 query option 层，再为 `refetchInterval` 写小而准的单测。
  - 只有在确实需要验证完整用户链路时，再补独立的页面级轮询回归测试，并避免污染同文件其他用例。
