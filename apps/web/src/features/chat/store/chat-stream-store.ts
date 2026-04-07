/**
 * 聊天流式运行状态管理模块。
 */

import type { MessageStatus } from "../constants";

/**
 * 描述流式运行的临时状态。
 */
export type StreamingRun = {
  runId: number;
  sessionId: number;
  assistantMessageId: number;
  retryOfMessageId?: number | null;
  userMessageId: number | null;
  userContent: string;
  content: string;
  sources: Array<Record<string, unknown>>;
  errorMessage: string | null;
  status: MessageStatus;
  toastShown: boolean;
};
