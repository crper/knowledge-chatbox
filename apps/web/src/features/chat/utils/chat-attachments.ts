/**
 * @file 聊天相关工具模块。
 */

import type { ChatAttachmentItem } from "../store/chat-ui-store";

/**
 * 描述Ready聊天附件的数据结构。
 */
export type ReadyChatAttachment = ChatAttachmentItem & {
  file: File;
  kind: "image" | "document";
  mimeType: string;
  resourceDocumentId: number;
  resourceDocumentVersionId: number;
  status: "uploaded";
};

/**
 * 判断Ready聊天附件是否成立。
 */
export function isReadyChatAttachment(
  attachment: ChatAttachmentItem,
): attachment is ReadyChatAttachment {
  return (
    attachment.status === "uploaded" &&
    Boolean(attachment.file) &&
    Boolean(attachment.mimeType) &&
    typeof attachment.resourceDocumentId === "number" &&
    typeof attachment.resourceDocumentVersionId === "number"
  );
}

/**
 * 获取Ready聊天附件。
 */
export function getReadyChatAttachments(attachments: ChatAttachmentItem[]): ReadyChatAttachment[] {
  return attachments.filter(isReadyChatAttachment);
}

/**
 * 判断是否存在Ready聊天附件。
 */
export function hasReadyChatAttachments(attachments: ChatAttachmentItem[]): boolean {
  return getReadyChatAttachments(attachments).length > 0;
}

/**
 * 判断是否存在可发送的聊天附件。
 */
export function hasSendableChatAttachments(attachments: ChatAttachmentItem[]): boolean {
  return attachments.some((attachment) => attachment.status !== "failed");
}
