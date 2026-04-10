import type { MessageStatus } from "../constants";

export type StreamingRunContent = string[];

export type StreamingRun = {
  runId: number;
  sessionId: number;
  assistantMessageId: number;
  retryOfMessageId?: number | null;
  userMessageId: number | null;
  userContent: string;
  content: StreamingRunContent;
  sources: Array<Record<string, unknown>>;
  errorMessage: string | null;
  status: MessageStatus;
  toastShown: boolean;
};

export type StreamingRunLike = Omit<StreamingRun, "content"> & {
  content: StreamingRunContent | string;
};

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

export function joinStreamingRunContent(content: StreamingRun["content"] | string): string {
  if (Array.isArray(content)) {
    return content.join("");
  }
  return content;
}

export function normalizeStreamingRun(run: StreamingRunLike): StreamingRun {
  if (Array.isArray(run.content)) {
    return run as StreamingRun;
  }
  return {
    ...run,
    content: normalizeStreamingRunContent(run.content),
  };
}
