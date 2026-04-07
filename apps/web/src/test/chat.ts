/**
 * @file 聊天测试辅助工具。
 */

import { cloneDeep } from "es-toolkit";

import type {
  ChatAttachmentItem,
  ChatSessionContextItem,
  ChatSourceItem,
} from "@/features/chat/api/chat";

type ChatAttachmentWithAliases = Partial<ChatAttachmentItem> & {
  attachment_id?: string;
  archived_at?: string | null;
  document_id?: number | null;
  document_revision_id?: number | null;
  mime_type: string;
  name: string;
  size_bytes?: number;
  type: string;
};

type ChatSessionContextMessageLike = {
  attachments_json?: ChatAttachmentWithAliases[] | null;
  id: number;
  role: string;
  sources_json?: ChatSourceItem[] | null | unknown[];
  [key: string]: unknown;
};

function getAttachmentDocumentId(attachment: ChatAttachmentWithAliases) {
  return attachment.resource_document_id ?? attachment.document_id ?? null;
}

function getAttachmentDocumentRevisionId(attachment: ChatAttachmentWithAliases) {
  return attachment.resource_document_version_id ?? attachment.document_revision_id ?? null;
}

function getAttachmentContextKey(attachment: ChatAttachmentWithAliases) {
  const documentId = getAttachmentDocumentId(attachment);
  if (documentId != null) {
    return `document:${documentId}`;
  }

  const documentRevisionId = getAttachmentDocumentRevisionId(attachment);
  if (documentRevisionId != null) {
    return `version:${documentRevisionId}`;
  }

  return `attachment:${attachment.attachment_id}`;
}

function toContextAttachment(attachment: ChatAttachmentWithAliases): ChatAttachmentWithAliases {
  const documentId = getAttachmentDocumentId(attachment);
  const documentRevisionId = getAttachmentDocumentRevisionId(attachment);

  return {
    ...attachment,
    attachment_id: attachment.attachment_id ?? `${attachment.name}-attachment`,
    archived_at: attachment.archived_at ?? null,
    document_id: documentId,
    document_revision_id: documentRevisionId,
    size_bytes: attachment.size_bytes ?? 1,
    type: attachment.type === "image" ? "image" : "document",
    resource_document_id: documentId,
    resource_document_version_id: documentRevisionId,
  };
}

export function cloneJson<T>(value: T): T {
  return cloneDeep(value);
}

export function buildChatSessionContext(
  sessionId: number,
  messages: ChatSessionContextMessageLike[],
): ChatSessionContextItem {
  const attachments = messages.flatMap((message) => message.attachments_json ?? []);
  const deduplicatedAttachments = new Map<string, ChatAttachmentWithAliases>();

  for (const attachment of attachments) {
    deduplicatedAttachments.set(
      getAttachmentContextKey(attachment),
      toContextAttachment(attachment),
    );
  }

  const latestAssistantMessage = [...messages]
    .reverse()
    .find((message) => message.role === "assistant");

  return {
    session_id: sessionId,
    attachment_count: deduplicatedAttachments.size,
    attachments: Array.from(deduplicatedAttachments.values()) as ChatAttachmentItem[],
    latest_assistant_message_id: latestAssistantMessage?.id ?? null,
    latest_assistant_sources: (latestAssistantMessage?.sources_json ?? []) as ChatSourceItem[],
  };
}
