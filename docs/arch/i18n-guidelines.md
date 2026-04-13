# 国际化（i18n）实现指南

这份文档说明前端工作台的国际化架构、开发规范和维护流程。重点回答：

- i18n 技术选型和核心配置
- 翻译 key 的组织规则
- 新增翻译、新增语言的标准流程
- 常见反模式和注意事项

配套阅读：

- [frontend-workspace.md](./frontend-workspace.md)
- [repo-map-and-conventions.md](./repo-map-and-conventions.md)

## 1. 技术选型

| 项目 | 选择 | 说明 |
|------|------|------|
| 核心库 | `i18next` v26 + `react-i18next` v17 | 社区标准，React 绑定成熟 |
| 资源加载 | 静态 JSON import | 不使用 `i18next-http-backend`，构建时全量打包 |
| 语言检测 | `detectBrowserLanguage()` | 优先 localStorage，其次 `navigator.languages`，最后回退默认语言 |
| 语言持久化 | zustand + localStorage | 键名 `knowledge-chatbox-language` |
| RTL 支持 | `isRtlLanguage()` + `document.documentElement.dir` | 自动设置 `dir` 属性 |

## 2. 核心文件

```
src/i18n/
  index.ts              # i18next 初始化、AppLanguage 类型、工具函数
  locales/
    zh-CN/              # 简体中文翻译
      common.json       # 通用 UI 文案、API 错误
      auth.json         # 登录、改密
      chat.json         # 对话、消息、附件、引用
      knowledge.json    # 资源管理、上传、预览
      settings.json     # 设置中心、Provider
      users.json        # 用户管理
    en/                 # 英文翻译（同结构）
      ...
src/providers/
  i18n-provider.tsx     # I18nProvider：监听语言变化、RTL dir 管理、首次 locale 检测
src/lib/config/
  constants.ts          # AppLanguage 类型重导出、DEFAULT_LANGUAGE、LANGUAGE_STORAGE_KEY
src/lib/store/
  ui-store.ts           # 语言偏好持久化
src/features/settings/components/
  language-toggle.tsx   # 语言切换 UI 组件
```

## 3. 命名空间与 key 组织

### 3.1 命名空间划分

| 命名空间 | 职责 | 默认使用场景 |
|----------|------|-------------|
| `common` | 通用 UI 文案、API 错误消息、侧栏、主题、导航 | 全局共享文案 |
| `auth` | 登录、改密 | 登录页、改密弹窗 |
| `chat` | 对话、消息、附件、引用、Markdown 渲染 | 对话页及子组件 |
| `knowledge` | 资源管理、上传、预览、版本 | 资源页及子组件 |
| `settings` | 设置中心、Provider 配置、连接测试 | 设置页及子组件 |
| `users` | 用户管理 | 用户管理页及子组件 |

### 3.2 key 命名规则

1. **camelCase**：所有 key 使用 camelCase，如 `imageViewerCountLabel`
2. **语义后缀**：按功能类型加后缀
   - 动作按钮：`*Action`，如 `sendAction`、`deleteAction`
   - 标签文本：`*Label`，如 `messageInputLabel`
   - 提示文案：`*Hint`，如 `attachmentDropActiveHint`
   - Toast 消息：`*Toast`，如 `uploadSuccessToast`
   - 错误消息：`*Error`，如 `usernameRequiredError`
   - 占位符：`*Placeholder`，如 `messageInputPlaceholder`
   - 标题：`*Title`，如 `uploadQueueTitle`
   - 描述：`*Description`，如 `uploadBlockedDescription`
3. **嵌套对象**：仅用于强关联的子组，如 `markdown.close`、`markdown.copyCode`
4. **插值参数**：使用 `{{param}}` 语法，如 `{{count}}`、`{{name}}`、`{{min}}`

### 3.3 i18n key 在 Zod schema 中的使用

Zod 验证消息使用 `namespace:key` 格式，由 `collectErrorMessages()` 在 `forms.ts` 中解析翻译：

```typescript
// 正确：使用 i18n key 作为默认消息
const requiredString = (message?: string) =>
  trimmedString().min(1, { message: message ?? "common:requiredFieldError" });

// 带参数的 key 使用冒号分隔
`common:positiveIntegerRangeError:${min}:${max}`
```

## 4. 使用规范

### 4.1 在组件中使用

```typescript
import { useTranslation } from "react-i18next";

// 单命名空间
const { t } = useTranslation("chat");
t("sendAction")

// 多命名空间
const { t } = useTranslation(["chat", "common"]);
t("sendAction")              // 默认 chat 命名空间
t("closeAction", { ns: "common" })  // 指定 common 命名空间

// 带插值参数
t("attachmentPanelLabel", { count: items.length })
```

### 4.2 在非组件代码中使用

```typescript
import { i18n } from "@/i18n";

// 直接调用 i18n.t
i18n.t("apiErrorGeneric", { ns: "common" })
```

### 4.3 禁止事项

| 禁止 | 原因 | 正确做法 |
|------|------|---------|
| 硬编码中文/英文字符串 | 切换语言时不会变化 | 使用 `t("key")` |
| `t("key", { defaultValue: "中文" })` | key 缺失时显示中文而非回退语言 | 确保翻译文件有完整 key，不设 defaultValue |
| 在翻译文件中遗漏 key | 英文 locale 缺失时显示 key 名 | 两种语言必须同步更新 |
| 创建新的 i18n 实例 | 与全局 i18n 实例冲突 | 使用 `@/i18n` 导出的单例 |
| 直接操作 `document.documentElement.dir` | 绕过 I18nProvider 的 RTL 管理 | 通过 `isRtlLanguage()` 判断，由 I18nProvider 统一管理 |

## 5. 新增翻译流程

### 5.1 新增 key

1. 在 `zh-CN/` 和 `en/` 对应命名空间 JSON 中同时添加 key
2. 在组件中使用 `t("newKey")`
3. 运行 `just web-check` 验证

### 5.2 新增命名空间

1. 在 `src/i18n/locales/zh-CN/` 和 `en/` 下创建新的 JSON 文件
2. 在 `src/i18n/index.ts` 中：
   - 添加 import
   - 添加到 `ns` 数组
   - 添加到 `resources` 对象
3. 在组件中使用 `useTranslation("newNamespace")`

### 5.3 新增语言

1. 在 `src/i18n/locales/` 下创建新的语言目录（如 `ja/`）
2. 复制所有命名空间 JSON 文件并翻译
3. 在 `src/i18n/index.ts` 中：
   - 添加所有 JSON import
   - 将新语言加入 `SUPPORTED_LANGUAGES` 数组
   - 添加到 `resources` 对象
4. 如需 RTL 支持，将语言代码加入 `RTL_LANGUAGES` 数组
5. 在 `language-toggle.tsx` 的 `LANGUAGE_ITEMS` 中添加新选项
6. 在 `common.json` 中添加新语言的显示名称 key

## 6. 语言检测优先级

```
1. localStorage (knowledge-chatbox-language)
2. navigator.languages 精确匹配
3. navigator.languages 前缀匹配
4. 默认语言 (zh-CN)
```

首次访问时，`I18nProvider` 会自动检测浏览器语言并持久化。用户手动切换后，以用户选择为准。

## 7. RTL 支持

当前支持的语言均为 LTR。若未来添加 RTL 语言（如阿拉伯语 `ar`、希伯来语 `he`）：

1. 将语言代码加入 `RTL_LANGUAGES` 数组
2. `I18nProvider` 会自动设置 `document.documentElement.dir`
3. Tailwind CSS 的 `rtl:` 变体可直接使用
4. 测试时确认布局方向正确

## 8. 测试中的 i18n

测试 setup（`src/test/setup.ts`）会在每个测试前重置语言为默认值：

```typescript
useUiStore.setState({ language: DEFAULT_LANGUAGE, theme: DEFAULT_THEME });
void i18n.changeLanguage(DEFAULT_LANGUAGE);
```

测试中不需要手动管理 i18n 状态。如果需要测试特定语言下的文案，在测试内切换：

```typescript
useUiStore.getState().setLanguage("en");
await i18n.changeLanguage("en");
```

## 9. 开发时缺失 key 提醒

开发模式下，i18next 配置了 `missingKeyHandler`，当翻译 key 缺失时会在控制台输出警告：

```
[i18n] Missing key: chat:newKey
```

生产环境不会输出此警告。

## 10. 常见问题

### Q: 为什么不用 `defaultValue`？

`defaultValue` 在 key 缺失时生效，但会导致两种问题：
1. 中文 `defaultValue` 在英文环境下仍显示中文
2. 掩盖了翻译文件不完整的问题

正确做法是确保翻译文件完整，不依赖 `defaultValue`。

### Q: 后端返回的错误消息如何处理？

`error-response.ts` 中的 `getUserFacingErrorMessage()` 会：
1. 优先匹配已知错误码到 i18n key
2. 匹配 HTTP 状态码到 i18n key
3. 当 `detail.source === "payload"` 且 `detail.message` 非空时，透传后端消息（不翻译）

第三种情况意味着后端返回的中文错误消息会直接显示。这是有意为之——后端验证消息通常包含具体字段信息，翻译可能丢失语义。

### Q: Streamdown 组件的翻译怎么处理？

`markdown-message.tsx` 中的 `useMarkdownTranslations()` 将 `chat.json` 的 `markdown.*` key 映射为 Streamdown 的 `translations` prop。新增 Streamdown 翻译时，同步更新此映射和翻译文件。
