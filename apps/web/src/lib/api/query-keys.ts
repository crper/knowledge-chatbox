/**
 * @file 全局 API 能力模块。
 */

import type { queryOptions } from "@tanstack/react-query";
import type { StreamingRun } from "@/features/chat/utils/streaming-run";

const STREAM_RUN_GC_TIME_MS = 5 * 60 * 1000;

/**
 * 集中管理 TanStack Query 查询键。
 */
export const queryKeys = {
  auth: {
    all: ["auth"] as const,
    me: ["auth", "me"] as const,
  },
  chat: {
    all: ["chat"] as const,
    context: (sessionId: number | null) => ["chat", "context", sessionId] as const,
    messages: (sessionId: number | null) => ["chat", "messages", sessionId] as const,
    messagesWindow: (sessionId: number | null) => ["chat", "messages-window", sessionId] as const,
    profile: ["chat", "profile"] as const,
    sessions: ["chat", "sessions"] as const,
    streamRuns: ["chat", "streamRun"] as const,
    streamRun: (runId: number) => ["chat", "streamRun", runId] as const,
  },
  documents: {
    all: ["documents"] as const,
    list: ["documents", "list"] as const,
    preview: (documentId: number | undefined, updatedAt: string | undefined) =>
      ["documents", "preview", documentId, updatedAt] as const,
    summary: ["documents", "summary"] as const,
    uploadReadiness: ["documents", "upload-readiness"] as const,
    versions: (documentId: number) => ["documents", "versions", documentId] as const,
  },
  settings: {
    all: ["settings"] as const,
    detail: ["settings", "detail"] as const,
  },
  users: {
    all: ["users"] as const,
    list: ["users", "list"] as const,
  },
};

export function streamRunQueryOptions(runId: number) {
  return {
    queryKey: queryKeys.chat.streamRun(runId),
    queryFn: () => null as StreamingRun | null,
    staleTime: Infinity,
    gcTime: STREAM_RUN_GC_TIME_MS,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
  } satisfies Parameters<typeof queryOptions>[0];
}
