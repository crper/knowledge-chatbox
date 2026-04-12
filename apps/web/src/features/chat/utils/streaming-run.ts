import type { ChatSourceItem } from "../api/chat";
import type { MessageStatus } from "../constants";

/**
 * 流式运行内容的类型别名，支持字符串数组或单个字符串。
 */
export type StreamingRunContent = string[];

/**
 * 流式运行的终端状态类型。
 * @remarks "failed" - 运行失败，"stopped" - 运行被停止，"succeeded" - 运行成功，null - 运行中
 */
export type StreamingRunTerminalState = "failed" | "stopped" | "succeeded" | null;

/**
 * 描述流式运行的完整数据结构。
 */
export type StreamingRun = {
  /** 运行唯一标识符 */
  runId: number;
  /** 会话 ID */
  sessionId: number;
  /** 助手消息 ID */
  assistantMessageId: number;
  /** 重试的原始消息 ID（可选） */
  retryOfMessageId?: number | null;
  /** 用户消息 ID */
  userMessageId: number | null;
  /** 用户输入内容 */
  userContent: string;
  /** 流式内容片段数组 */
  content: StreamingRunContent;
  /** 来源引用列表 */
  sources: ChatSourceItem[];
  /** 错误消息（如果有） */
  errorMessage: string | null;
  /** 当前消息状态 */
  status: MessageStatus;
  /** 是否抑制持久化的助手消息 */
  suppressPersistedAssistantMessage: boolean;
  /** 终端状态（null 表示运行中） */
  terminalState: StreamingRunTerminalState;
  /** 是否已显示 Toast 通知 */
  toastShown: boolean;
};

/**
 * 描述流式运行的宽松类型，用于处理 API 响应的不同格式。
 */
export type StreamingRunLike = Omit<
  StreamingRun,
  "content" | "suppressPersistedAssistantMessage" | "terminalState"
> & {
  /** 内容可以是数组或字符串 */
  content: StreamingRunContent | string;
  /** 抑制持久化标志（可选，默认 false） */
  suppressPersistedAssistantMessage?: boolean;
  /** 终端状态（可选，默认 null） */
  terminalState?: StreamingRunTerminalState;
};

/**
 * 将流式运行内容标准化为字符串数组格式。
 * @param content - 待标准化的内容（字符串或字符串数组）
 * @returns 标准化的字符串数组
 * @throws 无
 */
export function normalizeStreamingRunContent(
  content: StreamingRun["content"] | string,
): StreamingRunContent {
  if (Array.isArray(content)) {
    return content;
  }
  if (content.length === 0) {
    return [];
  }
  return [content];
}

/**
 * 将流式运行内容连接为单个字符串。
 * @param content - 待连接的内容（字符串或字符串数组）
 * @returns 连接后的字符串
 */
export function joinStreamingRunContent(content: StreamingRun["content"] | string): string {
  if (Array.isArray(content)) {
    return content.join("");
  }
  return content;
}

/**
 * 将宽松的 StreamingRunLike 类型转换为严格的 StreamingRun 类型。
 * @param run - 待标准化的流式运行对象
 * @returns 标准化后的流式运行对象
 */
export function normalizeStreamingRun(run: StreamingRunLike): StreamingRun {
  const normalizedContent = Array.isArray(run.content)
    ? run.content
    : normalizeStreamingRunContent(run.content);

  return {
    ...run,
    content: normalizedContent,
    suppressPersistedAssistantMessage: run.suppressPersistedAssistantMessage ?? false,
    terminalState: run.terminalState ?? null,
  };
}
