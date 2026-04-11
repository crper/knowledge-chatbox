/**
 * @file 聊天输入区附件面板模块。
 */

import type { AttachmentListItem } from "../utils/attachment-list-items";
import { AttachmentList } from "./attachment-list";

type MessageInputAttachmentsProps = {
  attachmentErrors: string[];
  attachmentScopeHint?: string | null;
  items: AttachmentListItem[];
};

/**
 * 渲染聊天输入区的附件列表、错误提示和范围说明。
 */
export function MessageInputAttachments({
  attachmentErrors,
  attachmentScopeHint = null,
  items,
}: MessageInputAttachmentsProps) {
  return (
    <>
      {items.length > 0 ? (
        <div className="space-y-2.5">
          <div className="space-y-2" data-testid="message-input-attachments">
            <AttachmentList
              defaultCollapsed={false}
              expandOnItemAdd
              items={items}
              testId="composer-attachment-list"
            />
          </div>
          {attachmentErrors.length > 0 ? (
            <div className="space-y-1 px-1">
              {attachmentErrors.map((errorMessage, index) => (
                <p className="text-ui-caption text-destructive" key={`${errorMessage}-${index}`}>
                  {errorMessage}
                </p>
              ))}
            </div>
          ) : null}
        </div>
      ) : null}

      {attachmentScopeHint ? (
        <p className="mt-2.5 px-1 text-ui-caption text-muted-foreground">{attachmentScopeHint}</p>
      ) : null}
    </>
  );
}
