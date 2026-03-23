/**
 * @file 聊天相关工具模块。
 */

import type { ChatAttachmentItem } from "../store/chat-ui-store";

/**
 * 判断是否存在可发送的聊天附件。
 */
export function hasSendableChatAttachments(attachments: ChatAttachmentItem[]): boolean {
  return attachments.some((attachment) => attachment.status !== "failed");
}
