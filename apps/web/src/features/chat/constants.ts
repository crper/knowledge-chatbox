/**
 * @file 聊天功能常量定义。
 */

/** 消息角色 */
export const MessageRole = {
  USER: "user",
  ASSISTANT: "assistant",
  SYSTEM: "system",
  TOOL: "tool",
} as const;

export type MessageRole = (typeof MessageRole)[keyof typeof MessageRole];

/** 消息状态 */
export const MessageStatus = {
  PENDING: "pending",
  STREAMING: "streaming",
  SUCCEEDED: "succeeded",
  FAILED: "failed",
} as const;

export type MessageStatus = (typeof MessageStatus)[keyof typeof MessageStatus];

/** 检查是否为流式状态 */
export function isStreamingStatus(status: string): boolean {
  return status === MessageStatus.PENDING || status === MessageStatus.STREAMING;
}

/** 检查是否为终止状态 */
export function isTerminalStatus(status: string): boolean {
  return status === MessageStatus.SUCCEEDED || status === MessageStatus.FAILED;
}
