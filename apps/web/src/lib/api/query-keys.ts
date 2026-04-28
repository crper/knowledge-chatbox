/**
 * @file 全局 API 查询键与查询选项。
 */

export const queryKeys = {
  auth: {
    all: ["auth"] as const,
    me: ["auth", "me"] as const,
  },
  chat: {
    all: ["chat"] as const,
    context: (sessionId: number | null) => ["chat", "context", sessionId] as const,
    imageViewerRemote: (url: string | null | undefined) =>
      ["chat", "image-viewer-remote", url] as const,
    messages: (sessionId: number | null) => ["chat", "messages", sessionId] as const,
    messagesWindow: (sessionId: number | null) => ["chat", "messages-window", sessionId] as const,
    profile: ["chat", "profile"] as const,
    sessions: ["chat", "sessions"] as const,
    streamRuns: ["chat", "streamRun"] as const,
    streamRun: (runId: number) => ["chat", "streamRun", runId] as const,
  },
  documents: {
    all: ["documents"] as const,
    imagePreview: (documentId: number) => ["documents", "image-preview", documentId] as const,
    list: ["documents", "list"] as const,
    summary: ["documents", "summary"] as const,
    textPreview: (documentId: number | undefined, updatedAt: string | undefined) =>
      ["documents", "text-preview", documentId, updatedAt] as const,
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
