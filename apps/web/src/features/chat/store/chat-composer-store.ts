/**
 * @file 聊天 composer 状态模块。
 */

import { create } from "zustand";
import { persist, type PersistStorage, type StorageValue } from "zustand/middleware";
import { immer } from "zustand/middleware/immer";

export const CHAT_SEND_SHORTCUT_STORAGE_KEY = "knowledge-chatbox-chat-send-shortcut";
export const CHAT_DRAFTS_STORAGE_KEY = "knowledge-chatbox-chat-drafts";
const CHAT_COMPOSER_STORE_STORAGE_KEY = "knowledge-chatbox-chat-composer-store";
const CHAT_COMPOSER_STORAGE_WRITE_DELAY_MS = 180;

const CHAT_SEND_SHORTCUT_OPTIONS = ["shift-enter", "enter"] as const;

export type ChatSendShortcut = (typeof CHAT_SEND_SHORTCUT_OPTIONS)[number];

export type ComposerAttachmentItem = {
  id: string;
  archivedAt?: string;
  errorMessage?: string;
  file?: File;
  kind: "image" | "document";
  mimeType?: string;
  name: string;
  progress?: number;
  documentId?: number;
  documentRevisionId?: number;
  sizeBytes?: number;
  status: "queued" | "uploading" | "uploaded" | "failed";
};

type ChatComposerState = {
  attachmentsBySession: Record<string, ComposerAttachmentItem[]>;
  draftsBySession: Record<string, string>;
  sendShortcut: ChatSendShortcut;
  addAttachment: (sessionId: number | null, attachment: ComposerAttachmentItem) => void;
  clearAttachments: (sessionId: number | null) => void;
  removeAttachment: (sessionId: number | null, attachmentId: string) => void;
  setAttachments: (sessionId: number | null, attachments: ComposerAttachmentItem[]) => void;
  setDraft: (sessionId: number | null, draft: string) => void;
  setSendShortcut: (shortcut: ChatSendShortcut) => void;
  updateAttachment: (
    sessionId: number | null,
    attachmentId: string,
    patch: Partial<ComposerAttachmentItem>,
  ) => void;
};

type PersistedChatComposerState = Pick<ChatComposerState, "draftsBySession" | "sendShortcut">;

function loadDrafts(): Record<string, string> {
  if (typeof window === "undefined") {
    return {};
  }

  const raw = window.localStorage.getItem(CHAT_DRAFTS_STORAGE_KEY);
  if (!raw) {
    return {};
  }

  try {
    return JSON.parse(raw);
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

let pendingValue: StorageValue<PersistedChatComposerState> | null = null;
let pendingTimer: ReturnType<typeof setTimeout> | null = null;
let lifecycleBound = false;

function flushToStorage() {
  if (pendingValue === null || typeof window === "undefined") {
    return;
  }

  const value = pendingValue;
  pendingValue = null;
  pendingTimer = null;
  window.localStorage.setItem(CHAT_SEND_SHORTCUT_STORAGE_KEY, value.state.sendShortcut);
  window.localStorage.setItem(CHAT_DRAFTS_STORAGE_KEY, JSON.stringify(value.state.draftsBySession));
}

function bindLifecycleFlush() {
  if (typeof window === "undefined" || lifecycleBound) {
    return;
  }

  const flushOnHidden = () => {
    if (document.visibilityState === "hidden") {
      flushToStorage();
    }
  };

  window.addEventListener("pagehide", flushToStorage);
  document.addEventListener("visibilitychange", flushOnHidden);
  lifecycleBound = true;
}

const chatComposerStoreStorage: PersistStorage<PersistedChatComposerState> = {
  getItem: () => ({
    state: {
      draftsBySession: loadDrafts(),
      sendShortcut: loadSendShortcut(),
    },
  }),
  setItem: (_name, value: StorageValue<PersistedChatComposerState>) => {
    if (typeof window === "undefined") {
      return;
    }

    bindLifecycleFlush();
    pendingValue = value;
    if (pendingTimer !== null) {
      return;
    }

    pendingTimer = setTimeout(flushToStorage, CHAT_COMPOSER_STORAGE_WRITE_DELAY_MS);
  },
  removeItem: () => {
    if (typeof window === "undefined") {
      return;
    }

    pendingValue = null;
    if (pendingTimer !== null) {
      clearTimeout(pendingTimer);
      pendingTimer = null;
    }
    window.localStorage.removeItem(CHAT_SEND_SHORTCUT_STORAGE_KEY);
    window.localStorage.removeItem(CHAT_DRAFTS_STORAGE_KEY);
  },
};

/**
 * 集中管理聊天 composer 的草稿、附件与发送偏好。
 *
 * 仅 `draftsBySession` / `sendShortcut` 会被持久化；`attachmentsBySession`
 * 保持内存态，避免把 `File` 对象写入 localStorage。
 */
export const useChatComposerStore = create<ChatComposerState>()(
  persist(
    immer((set) => ({
      attachmentsBySession: {},
      draftsBySession: {},
      sendShortcut: "enter" as ChatSendShortcut,
      addAttachment: (sessionId, attachment) => {
        if (sessionId === null) return;
        set((state) => {
          const key = String(sessionId);
          if (!state.attachmentsBySession[key]) {
            state.attachmentsBySession[key] = [];
          }
          state.attachmentsBySession[key].push(attachment);
        });
      },
      clearAttachments: (sessionId) => {
        if (sessionId === null) return;
        set((state) => {
          state.attachmentsBySession[String(sessionId)] = [];
        });
      },
      removeAttachment: (sessionId, attachmentId) => {
        if (sessionId === null) return;
        set((state) => {
          const key = String(sessionId);
          const list = state.attachmentsBySession[key];
          if (!list) return;
          const idx = list.findIndex((attachment) => attachment.id === attachmentId);
          if (idx !== -1) {
            list.splice(idx, 1);
          }
        });
      },
      setAttachments: (sessionId, attachments) => {
        if (sessionId === null) return;
        set((state) => {
          state.attachmentsBySession[String(sessionId)] = attachments;
        });
      },
      setDraft: (sessionId, draft) => {
        if (sessionId === null) {
          return;
        }

        set((state) => {
          state.draftsBySession[String(sessionId)] = draft;
        });
      },
      setSendShortcut: (sendShortcut) => set({ sendShortcut }),
      updateAttachment: (sessionId, attachmentId, patch) => {
        if (sessionId === null) return;
        set((state) => {
          const item = state.attachmentsBySession[String(sessionId)]?.find(
            (attachment) => attachment.id === attachmentId,
          );
          if (item) {
            Object.assign(item, patch);
          }
        });
      },
    })),
    {
      name: CHAT_COMPOSER_STORE_STORAGE_KEY,
      partialize: (state) => ({
        draftsBySession: state.draftsBySession,
        sendShortcut: state.sendShortcut,
      }),
      storage: chatComposerStoreStorage,
    },
  ),
);
