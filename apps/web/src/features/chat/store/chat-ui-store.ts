/**
 * @file 聊天相关状态模块。
 */

import { create } from "zustand";
import { persist, type PersistStorage, type StorageValue } from "zustand/middleware";

export const CHAT_SEND_SHORTCUT_STORAGE_KEY = "knowledge-chatbox-chat-send-shortcut";
export const CHAT_DRAFTS_STORAGE_KEY = "knowledge-chatbox-chat-drafts";
const CHAT_UI_STORE_STORAGE_KEY = "knowledge-chatbox-chat-ui-store";
/**
 * 定义聊天发送快捷键选项。
 */
const CHAT_SEND_SHORTCUT_OPTIONS = ["shift-enter", "enter"] as const;

/**
 * 描述聊天发送Shortcut的数据结构。
 */
export type ChatSendShortcut = (typeof CHAT_SEND_SHORTCUT_OPTIONS)[number];
/**
 * 描述聊天附件项的数据结构。
 */
export type ChatAttachmentItem = {
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

function loadDrafts() {
  if (typeof window === "undefined") {
    return {} as Record<string, string>;
  }

  const raw = window.localStorage.getItem(CHAT_DRAFTS_STORAGE_KEY);
  if (!raw) {
    return {} as Record<string, string>;
  }

  try {
    return JSON.parse(raw) as Record<string, string>;
  } catch {
    return {};
  }
}

function loadSendShortcut(): ChatSendShortcut {
  if (typeof window === "undefined") {
    return "enter";
  }

  const raw = window.localStorage.getItem(CHAT_SEND_SHORTCUT_STORAGE_KEY);
  if (raw === "enter" || raw === "shift-enter") {
    return raw;
  }
  return "enter";
}

type ChatUiState = {
  activeSessionId: number | null;
  attachmentsBySession: Record<string, ChatAttachmentItem[]>;
  draftsBySession: Record<string, string>;
  sendShortcut: ChatSendShortcut;
  addAttachment: (sessionId: number | null, attachment: ChatAttachmentItem) => void;
  clearAttachments: (sessionId: number | null) => void;
  removeAttachment: (sessionId: number | null, attachmentId: string) => void;
  setActiveSessionId: (sessionId: number | null) => void;
  setAttachments: (sessionId: number | null, attachments: ChatAttachmentItem[]) => void;
  setSendShortcut: (shortcut: ChatSendShortcut) => void;
  setDraft: (sessionId: number | null, draft: string) => void;
  updateAttachment: (
    sessionId: number | null,
    attachmentId: string,
    patch: Partial<ChatAttachmentItem>,
  ) => void;
};

type PersistedChatUiState = Pick<ChatUiState, "draftsBySession" | "sendShortcut">;

const chatUiStoreStorage: PersistStorage<PersistedChatUiState> = {
  getItem: () => ({
    state: {
      draftsBySession: loadDrafts(),
      sendShortcut: loadSendShortcut(),
    },
  }),
  setItem: (_name, value: StorageValue<PersistedChatUiState>) => {
    if (typeof window === "undefined") {
      return;
    }

    window.localStorage.setItem(CHAT_SEND_SHORTCUT_STORAGE_KEY, value.state.sendShortcut);
    window.localStorage.setItem(
      CHAT_DRAFTS_STORAGE_KEY,
      JSON.stringify(value.state.draftsBySession),
    );
  },
  removeItem: () => {
    if (typeof window === "undefined") {
      return;
    }

    window.localStorage.removeItem(CHAT_SEND_SHORTCUT_STORAGE_KEY);
    window.localStorage.removeItem(CHAT_DRAFTS_STORAGE_KEY);
  },
};

/**
 * 集中管理聊天输入与附件状态。
 */
export const useChatUiStore = create<ChatUiState>()(
  persist(
    (set) => ({
      activeSessionId: null,
      attachmentsBySession: {},
      draftsBySession: {},
      sendShortcut: "enter",
      addAttachment: (sessionId, attachment) => {
        if (sessionId === null) {
          return;
        }
        set((state) => ({
          attachmentsBySession: {
            ...state.attachmentsBySession,
            [String(sessionId)]: [
              ...(state.attachmentsBySession[String(sessionId)] ?? []),
              attachment,
            ],
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
      setActiveSessionId: (activeSessionId) => set({ activeSessionId }),
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
      setSendShortcut: (sendShortcut) => set({ sendShortcut }),
      setDraft: (sessionId, draft) => {
        if (sessionId === null) {
          return;
        }
        set((state) => ({
          draftsBySession: {
            ...state.draftsBySession,
            [String(sessionId)]: draft,
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
    }),
    {
      name: CHAT_UI_STORE_STORAGE_KEY,
      partialize: (state) => ({
        draftsBySession: state.draftsBySession,
        sendShortcut: state.sendShortcut,
      }),
      storage: chatUiStoreStorage,
    },
  ),
);
