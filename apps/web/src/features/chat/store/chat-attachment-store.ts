import { create } from "zustand";

import type { ChatAttachmentItem } from "./chat-ui-store";

type ChatAttachmentState = {
  attachmentsBySession: Record<string, ChatAttachmentItem[]>;
  addAttachment: (sessionId: number | null, attachment: ChatAttachmentItem) => void;
  clearAttachments: (sessionId: number | null) => void;
  removeAttachment: (sessionId: number | null, attachmentId: string) => void;
  setAttachments: (sessionId: number | null, attachments: ChatAttachmentItem[]) => void;
  updateAttachment: (
    sessionId: number | null,
    attachmentId: string,
    patch: Partial<ChatAttachmentItem>,
  ) => void;
};

export const useChatAttachmentStore = create<ChatAttachmentState>((set) => ({
  attachmentsBySession: {},
  addAttachment: (sessionId, attachment) => {
    if (sessionId === null) {
      return;
    }

    set((state) => ({
      attachmentsBySession: {
        ...state.attachmentsBySession,
        [String(sessionId)]: [...(state.attachmentsBySession[String(sessionId)] ?? []), attachment],
      },
    }));
  },
  clearAttachments: (sessionId) => {
    if (sessionId === null) {
      return;
    }

    set((state) => ({
      attachmentsBySession: {
        ...state.attachmentsBySession,
        [String(sessionId)]: [],
      },
    }));
  },
  removeAttachment: (sessionId, attachmentId) => {
    if (sessionId === null) {
      return;
    }

    set((state) => ({
      attachmentsBySession: {
        ...state.attachmentsBySession,
        [String(sessionId)]: (state.attachmentsBySession[String(sessionId)] ?? []).filter(
          (attachment) => attachment.id !== attachmentId,
        ),
      },
    }));
  },
  setAttachments: (sessionId, attachments) => {
    if (sessionId === null) {
      return;
    }

    set((state) => ({
      attachmentsBySession: {
        ...state.attachmentsBySession,
        [String(sessionId)]: attachments,
      },
    }));
  },
  updateAttachment: (sessionId, attachmentId, patch) => {
    if (sessionId === null) {
      return;
    }

    set((state) => ({
      attachmentsBySession: {
        ...state.attachmentsBySession,
        [String(sessionId)]: (state.attachmentsBySession[String(sessionId)] ?? []).map(
          (attachment) =>
            attachment.id === attachmentId ? { ...attachment, ...patch } : attachment,
        ),
      },
    }));
  },
}));

export function resetChatAttachmentStore() {
  useChatAttachmentStore.setState({
    attachmentsBySession: {},
  });
}
