/**
 * @file 全局 API 能力模块。
 */

/**
 * 集中管理 TanStack Query 查询键。
 */
export const queryKeys = {
  auth: {
    me: ["auth", "me"] as const,
  },
  chat: {
    context: (sessionId: number | null) => ["chat", "context", sessionId] as const,
    messages: (sessionId: number | null) => ["chat", "messages", sessionId] as const,
    profile: ["chat", "profile"] as const,
    sessions: ["chat", "sessions"] as const,
  },
  documents: {
    list: ["documents", "list"] as const,
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
