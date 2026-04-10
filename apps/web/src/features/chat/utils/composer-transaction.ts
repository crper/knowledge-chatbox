import { useChatAttachmentStore } from "../store/chat-attachment-store";
import { useChatUiStore } from "../store/chat-ui-store";
import type { ComposerAttachmentItem } from "../store/chat-attachment-store";

import { cloneChatAttachments } from "./chat-submit-helpers";

export type ComposerSnapshot = {
  attachments: ComposerAttachmentItem[];
  draft: string;
};

export function snapshotComposer(sessionId: number): ComposerSnapshot {
  const draft = useChatUiStore.getState().draftsBySession[String(sessionId)] ?? "";
  const attachments = cloneChatAttachments(
    useChatAttachmentStore.getState().attachmentsBySession[String(sessionId)] ?? [],
  );

  return { attachments, draft };
}

export function clearComposer(sessionId: number): void {
  useChatUiStore.getState().setDraft(sessionId, "");
  useChatAttachmentStore.getState().clearAttachments(sessionId);
}

export function restoreComposer(sessionId: number, snapshot: ComposerSnapshot): void {
  useChatUiStore.getState().setDraft(sessionId, snapshot.draft);
  useChatAttachmentStore.getState().setAttachments(sessionId, snapshot.attachments);
}
