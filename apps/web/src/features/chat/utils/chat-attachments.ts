/**
 * @file 聊天相关工具模块。
 */

import type { ComposerAttachmentItem } from "../store/chat-attachment-store";

/**
 * 判断是否存在可发送的聊天附件。
 */
export function hasSendableChatAttachments(attachments: ComposerAttachmentItem[]): boolean {
  return attachments.some((attachment) => attachment.status !== "failed");
}
