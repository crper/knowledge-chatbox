import { type ComposerAttachmentItem, useChatComposerStore } from "../store/chat-composer-store";

export type ComposerSnapshot = {
  attachments: ComposerAttachmentItem[];
  draft: string;
};

export function snapshotComposer(sessionId: number): ComposerSnapshot {
  const draft = useChatComposerStore.getState().draftsBySession[String(sessionId)] ?? "";
  const attachments = (
    useChatComposerStore.getState().attachmentsBySession[String(sessionId)] ?? []
  ).map((a) => ({ ...a }));

  return { attachments, draft };
}

export function clearComposer(sessionId: number): void {
  useChatComposerStore.getState().setDraft(sessionId, "");
  useChatComposerStore.getState().clearAttachments(sessionId);
}

export function restoreComposer(sessionId: number, snapshot: ComposerSnapshot): void {
  useChatComposerStore.getState().setDraft(sessionId, snapshot.draft);
  useChatComposerStore.getState().setAttachments(sessionId, snapshot.attachments);
}
