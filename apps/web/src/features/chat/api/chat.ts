/**
 * @file 聊天相关接口请求模块。
 */

import { openapiRequestRequired } from "@/lib/api/client";
import { apiFetchClient } from "@/lib/api/generated/client";
import type { components } from "@/lib/api/generated/schema";

export type ChatReasoningMode = components["schemas"]["ReasoningMode"];
export type ChatMessageStatus = components["schemas"]["ChatMessageStatus"];
export type ChatMessageRole = components["schemas"]["ChatMessageRole"];

export type ChatSessionItem = components["schemas"]["ChatSessionRead"];

export type ChatAttachmentItem = components["schemas"]["ChatAttachmentMetadata"];

export type ChatSourceItem = components["schemas"]["ChatSourceRead"];

export type ChatProfileItem = components["schemas"]["ChatProfileRead"];

export type ChatSessionContextItem = components["schemas"]["ChatSessionContextRead"];

export type ChatMessageItem = {
  attachments?: ChatAttachmentItem[] | null;
  id: number;
  session_id?: number;
  role: ChatMessageRole;
  content: string;
  status: ChatMessageStatus;
  client_request_id?: string | null;
  error_message?: string | null;
  retry_of_message_id?: number | null;
  reply_to_message_id?: number | null;
  sources?: ChatSourceItem[] | null;
  created_at?: string;
};

type ChatMessageRead = components["schemas"]["ChatMessageRead"];

type CreateChatSessionRequest = {
  reasoning_mode: ChatReasoningMode;
  title?: string | null;
};

type UpdateChatSessionRequest = {
  reasoning_mode?: ChatReasoningMode | null;
  title?: string | null;
};

export function createChatSession(input: { title?: string; reasoning_mode?: ChatReasoningMode }) {
  const body: CreateChatSessionRequest = {
    title: input.title ?? null,
    reasoning_mode: input.reasoning_mode ?? "default",
  };
  return openapiRequestRequired<ChatSessionItem>(
    apiFetchClient.POST("/api/chat/sessions", { body }),
  );
}

export function getChatSessions() {
  return openapiRequestRequired<ChatSessionItem[]>(apiFetchClient.GET("/api/chat/sessions"));
}

export function getChatProfile() {
  return openapiRequestRequired<ChatProfileItem>(apiFetchClient.GET("/api/chat/profile"));
}

export async function getChatMessagesWindow(
  sessionId: number,
  input: { beforeId?: number | null; limit: number },
) {
  const messages = await openapiRequestRequired<ChatMessageRead[]>(
    apiFetchClient.GET("/api/chat/sessions/{session_id}/messages", {
      params: {
        path: { session_id: sessionId },
        query: {
          before_id: input.beforeId ?? undefined,
          limit: input.limit,
        },
      },
    }),
  );
  return messages as ChatMessageItem[];
}

type ChatSessionContextRead = components["schemas"]["ChatSessionContextRead"];

export async function getChatSessionContext(sessionId: number) {
  return openapiRequestRequired<ChatSessionContextRead>(
    apiFetchClient.GET("/api/chat/sessions/{session_id}/context", {
      params: { path: { session_id: sessionId } },
    }),
  );
}

export function updateChatSession(
  sessionId: number,
  input: { title?: string | null; reasoning_mode?: ChatReasoningMode | null },
) {
  const body: UpdateChatSessionRequest = {};
  if ("title" in input) {
    body.title = input.title ?? null;
  }
  if ("reasoning_mode" in input) {
    body.reasoning_mode = input.reasoning_mode ?? null;
  }
  return openapiRequestRequired<ChatSessionItem>(
    apiFetchClient.PATCH("/api/chat/sessions/{session_id}", {
      params: { path: { session_id: sessionId } },
      body,
    }),
  );
}

export function renameChatSession(sessionId: number, input: { title?: string | null }) {
  return updateChatSession(sessionId, { title: input.title ?? null });
}

export function deleteChatSession(sessionId: number) {
  return openapiRequestRequired<{ deleted: boolean }>(
    apiFetchClient.DELETE("/api/chat/sessions/{session_id}", {
      params: { path: { session_id: sessionId } },
    }),
  );
}

export function deleteChatMessage(messageId: number) {
  return openapiRequestRequired<{ deleted: boolean }>(
    apiFetchClient.DELETE("/api/chat/messages/{message_id}", {
      params: { path: { message_id: messageId } },
    }),
  );
}

export function cancelChatRun(runId: number) {
  return openapiRequestRequired<{ cancelled: boolean }>(
    apiFetchClient.POST("/api/chat/runs/{run_id}/cancel", {
      params: { path: { run_id: runId } },
    }),
  );
}

export function cancelPendingChatStream(sessionId: number, clientRequestId: string) {
  return openapiRequestRequired<{ cancelled: boolean }>(
    apiFetchClient.POST("/api/chat/sessions/{session_id}/messages/stream/cancel", {
      body: {
        client_request_id: clientRequestId,
      },
      params: { path: { session_id: sessionId } },
    }),
  );
}
