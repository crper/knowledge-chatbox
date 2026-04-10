import { create } from "zustand";

export type ComposerAttachmentItem = {
  id: string;
  archivedAt?: string;
  errorMessage?: string;
  file?: File;
  kind: "image" | "document";
  mimeType?: string;
  name: string;
  progress?: number;
  resourceDocumentId?: number;
  resourceDocumentVersionId?: number;
  sizeBytes?: number;
  status: "queued" | "uploading" | "uploaded" | "failed";
};

type ChatAttachmentState = {
  attachmentsBySession: Record<string, ComposerAttachmentItem[]>;
  addAttachment: (sessionId: number | null, attachment: ComposerAttachmentItem) => void;
  clearAttachments: (sessionId: number | null) => void;
  removeAttachment: (sessionId: number | null, attachmentId: string) => void;
  setAttachments: (sessionId: number | null, attachments: ComposerAttachmentItem[]) => void;
  updateAttachment: (
    sessionId: number | null,
    attachmentId: string,
    patch: Partial<ComposerAttachmentItem>,
  ) => void;
};

export const useChatAttachmentStore = create<ChatAttachmentState>((set) => ({
  attachmentsBySession: {},
  addAttachment: (sessionId, attachment) => {
    if (sessionId === null) {
      return;
    }

    const key = String(sessionId);
    set((state) => ({
      attachmentsBySession: {
        ...state.attachmentsBySession,
        [key]: [...(state.attachmentsBySession[key] ?? []), attachment],
      },
    }));
  },
  clearAttachments: (sessionId) => {
    if (sessionId === null) {
      return;
    }

    const key = String(sessionId);
    set((state) => ({
      attachmentsBySession: {
        ...state.attachmentsBySession,
        [key]: [],
      },
    }));
  },
  removeAttachment: (sessionId, attachmentId) => {
    if (sessionId === null) {
      return;
    }

    const key = String(sessionId);
    set((state) => ({
      attachmentsBySession: {
        ...state.attachmentsBySession,
        [key]: (state.attachmentsBySession[key] ?? []).filter(
          (attachment) => attachment.id !== attachmentId,
        ),
      },
    }));
  },
  setAttachments: (sessionId, attachments) => {
    if (sessionId === null) {
      return;
    }

    const key = String(sessionId);
    set((state) => ({
      attachmentsBySession: {
        ...state.attachmentsBySession,
        [key]: attachments,
      },
    }));
  },
  updateAttachment: (sessionId, attachmentId, patch) => {
    if (sessionId === null) {
      return;
    }

    const key = String(sessionId);
    set((state) => ({
      attachmentsBySession: {
        ...state.attachmentsBySession,
        [key]: (state.attachmentsBySession[key] ?? []).map((attachment) =>
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
