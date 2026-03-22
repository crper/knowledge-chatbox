/**
 * @file 聊天相关工具模块。
 */

import type { ChatMessageItem } from "../api/chat";

function getAttachmentGroupKey(
  attachment: NonNullable<ChatMessageItem["attachments_json"]>[number],
) {
  if (typeof attachment.resource_document_id === "number") {
    return `document:${attachment.resource_document_id}`;
  }

  if (typeof attachment.resource_document_version_id === "number") {
    return `version:${attachment.resource_document_version_id}`;
  }

  return `attachment:${attachment.attachment_id}`;
}

/**
 * 收集附件。
 */
export function collectAttachments(messages: ChatMessageItem[]) {
  const attachments = messages.flatMap((message) => message.attachments_json ?? []);
  const attachmentMap = new Map<string, (typeof attachments)[number]>();

  for (const attachment of attachments) {
    attachmentMap.set(getAttachmentGroupKey(attachment), attachment);
  }

  return Array.from(attachmentMap.values());
}
