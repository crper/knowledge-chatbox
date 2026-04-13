/**
 * @file 聊天功能常量定义。
 */

import type { ChatMessageRole, ChatMessageStatus } from "./api/chat";

export const MessageRole = {
  USER: "user",
  ASSISTANT: "assistant",
  SYSTEM: "system",
} as const satisfies Record<string, ChatMessageRole>;

export type MessageRole = ChatMessageRole;

export const MessageStatus = {
  PENDING: "pending",
  STREAMING: "streaming",
  SUCCEEDED: "succeeded",
  FAILED: "failed",
  CANCELLED: "cancelled",
} as const satisfies Record<string, ChatMessageStatus>;

export type MessageStatus = ChatMessageStatus;

export type StreamingStatus = "pending" | "streaming";

export function isStreamingStatus(status: string): status is StreamingStatus {
  return status === MessageStatus.PENDING || status === MessageStatus.STREAMING;
}
