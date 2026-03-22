/**
 * @file 聊天相关接口请求模块。
 */

import { openapiRequestRequired } from "@/lib/api/client";
import { apiFetchClient } from "@/lib/api/generated/client";
import type { components } from "@/lib/api/generated/schema";

export type ChatReasoningMode = "default" | "off" | "on";

export type ChatSessionItem = {
  id: number;
  user_id?: number;
  reasoning_mode: ChatReasoningMode;
  title: string | null;
  created_at?: string;
  updated_at?: string;
};

export type ChatAttachmentItem = {
  attachment_id: string;
  type: "image" | "document";
  name: string;
  mime_type: string;
  size_bytes: number;
  resource_document_id?: number | null;
  resource_document_version_id?: number | null;
  archived_at?: string | null;
};

export type ChatSourceItem = {
  chunk_id: string;
  section_title?: string;
  page_number?: number;
  snippet?: string;
  document_id?: number;
  document_name?: string;
  score?: number;
};

export type ChatProfileItem = {
  configured: boolean;
  model: string | null;
  provider: "openai" | "anthropic" | "ollama";
};

export type ChatMessageItem = {
  attachments_json?: ChatAttachmentItem[] | null;
  id: number;
  session_id?: number;
  role: "user" | "assistant" | "system";
  content: string;
  status: string;
  client_request_id?: string | null;
  error_message?: string | null;
  retry_of_message_id?: number | null;
  reply_to_message_id?: number | null;
  sources_json?: ChatSourceItem[] | null;
  created_at?: string;
};

export type ChatMessagePair = {
  assistant_message: ChatMessageItem;
  user_message: ChatMessageItem;
};

type ChatMessageRead = components["schemas"]["ChatMessageRead"];
type ChatAttachmentRead = NonNullable<ChatMessageRead["attachments_json"]>[number];

type ArchiveChatAttachmentRequest = {
  document_revision_id: number;
};

type CreateChatMessageRequest = {
  content: string;
  client_request_id: string;
  retry_of_message_id?: number | null;
};

type CreateChatSessionRequest = {
  reasoning_mode: ChatReasoningMode;
  title?: string | null;
};

type UpdateChatSessionRequest = {
  reasoning_mode?: ChatReasoningMode | null;
  title?: string | null;
};

function toChatAttachmentItem(attachment: ChatAttachmentRead): ChatAttachmentItem {
  return {
    attachment_id: attachment.attachment_id,
    type: attachment.type,
    name: attachment.name,
    mime_type: attachment.mime_type,
    size_bytes: attachment.size_bytes,
    resource_document_id: attachment.document_id ?? null,
    resource_document_version_id: attachment.document_revision_id ?? null,
    archived_at: attachment.archived_at ?? null,
  };
}

function toChatMessageItem(message: ChatMessageRead): ChatMessageItem {
  return {
    attachments_json: message.attachments_json?.map(toChatAttachmentItem) ?? null,
    id: message.id,
    session_id: message.session_id,
    role: message.role as "user" | "assistant" | "system",
    content: message.content,
    status: message.status,
    client_request_id: message.client_request_id ?? null,
    error_message: message.error_message ?? null,
    retry_of_message_id: message.retry_of_message_id ?? null,
    reply_to_message_id: message.reply_to_message_id ?? null,
    sources_json: (message.sources_json as ChatSourceItem[] | null | undefined) ?? null,
    created_at: message.created_at,
  };
}

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

export async function getChatMessages(sessionId: number) {
  const messages = await openapiRequestRequired<ChatMessageRead[]>(
    apiFetchClient.GET("/api/chat/sessions/{session_id}/messages", {
      params: { path: { session_id: sessionId } },
    }),
  );
  return messages.map(toChatMessageItem);
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

export async function sendChatMessage(
  sessionId: number,
  input: { content: string; client_request_id: string; retry_of_message_id?: number },
) {
  const body: CreateChatMessageRequest = {
    content: input.content,
    client_request_id: input.client_request_id,
    retry_of_message_id: input.retry_of_message_id ?? null,
  };
  const pair = await openapiRequestRequired<components["schemas"]["ChatMessagePairRead"]>(
    apiFetchClient.POST("/api/chat/sessions/{session_id}/messages", {
      params: { path: { session_id: sessionId } },
      body,
    }),
  );
  return {
    user_message: toChatMessageItem(pair.user_message),
    assistant_message: toChatMessageItem(pair.assistant_message),
  } satisfies ChatMessagePair;
}

export async function archiveChatMessageAttachment(
  messageId: number,
  attachmentId: string,
  input: { document_revision_id?: number; document_id?: number },
) {
  const body: ArchiveChatAttachmentRequest = {
    document_revision_id: input.document_revision_id ?? input.document_id ?? 0,
  };
  const message = await openapiRequestRequired<ChatMessageRead>(
    apiFetchClient.POST("/api/chat/messages/{message_id}/attachments/{attachment_id}/archive", {
      params: {
        path: {
          message_id: messageId,
          attachment_id: attachmentId,
        },
      },
      body,
    }),
  );
  return toChatMessageItem(message);
}
