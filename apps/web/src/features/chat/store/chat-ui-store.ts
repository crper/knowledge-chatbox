/**
 * @file 聊天相关状态模块。
 */

import { create } from "zustand";
import { persist, type PersistStorage, type StorageValue } from "zustand/middleware";

export const CHAT_SEND_SHORTCUT_STORAGE_KEY = "knowledge-chatbox-chat-send-shortcut";
export const CHAT_DRAFTS_STORAGE_KEY = "knowledge-chatbox-chat-drafts";
const CHAT_UI_STORE_STORAGE_KEY = "knowledge-chatbox-chat-ui-store";
const CHAT_UI_STORAGE_WRITE_DELAY_MS = 180;
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

type ChatUiState = {
  draftsBySession: Record<string, string>;
  sendShortcut: ChatSendShortcut;
  setSendShortcut: (shortcut: ChatSendShortcut) => void;
  setDraft: (sessionId: number | null, draft: string) => void;
};

type PersistedChatUiState = Pick<ChatUiState, "draftsBySession" | "sendShortcut">;

let pendingPersistedChatUiState: StorageValue<PersistedChatUiState> | null = null;
let persistTimer: number | null = null;
let lastPersistedSnapshot = "";
let flushLifecycleBound = false;

function serializePersistedChatUiState(value: StorageValue<PersistedChatUiState>) {
  return JSON.stringify({
    draftsBySession: value.state.draftsBySession,
    sendShortcut: value.state.sendShortcut,
  });
}

function clearPersistTimer() {
  if (persistTimer === null) {
    return;
  }

  window.clearTimeout(persistTimer);
  persistTimer = null;
}

function flushPersistedChatUiState() {
  if (typeof window === "undefined" || pendingPersistedChatUiState === null) {
    return;
  }

  const nextValue = pendingPersistedChatUiState;
  const nextSnapshot = serializePersistedChatUiState(nextValue);
  pendingPersistedChatUiState = null;
  clearPersistTimer();

  if (nextSnapshot === lastPersistedSnapshot) {
    return;
  }

  window.localStorage.setItem(CHAT_SEND_SHORTCUT_STORAGE_KEY, nextValue.state.sendShortcut);
  window.localStorage.setItem(
    CHAT_DRAFTS_STORAGE_KEY,
    JSON.stringify(nextValue.state.draftsBySession),
  );
  lastPersistedSnapshot = nextSnapshot;
}

function bindPersistFlushLifecycle() {
  if (typeof window === "undefined" || flushLifecycleBound) {
    return;
  }

  const flushOnHidden = () => {
    if (document.visibilityState === "hidden") {
      flushPersistedChatUiState();
    }
  };

  window.addEventListener("pagehide", flushPersistedChatUiState);
  document.addEventListener("visibilitychange", flushOnHidden);
  flushLifecycleBound = true;
}

const chatUiStoreStorage: PersistStorage<PersistedChatUiState> = {
  getItem: () => {
    const state = {
      draftsBySession: loadDrafts(),
      sendShortcut: loadSendShortcut(),
    } satisfies PersistedChatUiState;
    lastPersistedSnapshot = JSON.stringify(state);

    return { state };
  },
  setItem: (_name, value: StorageValue<PersistedChatUiState>) => {
    if (typeof window === "undefined") {
      return;
    }

    bindPersistFlushLifecycle();
    pendingPersistedChatUiState = value;
    if (persistTimer !== null) {
      return;
    }

    persistTimer = window.setTimeout(flushPersistedChatUiState, CHAT_UI_STORAGE_WRITE_DELAY_MS);
  },
  removeItem: () => {
    if (typeof window === "undefined") {
      return;
    }

    pendingPersistedChatUiState = null;
    clearPersistTimer();
    lastPersistedSnapshot = "";
    window.localStorage.removeItem(CHAT_SEND_SHORTCUT_STORAGE_KEY);
    window.localStorage.removeItem(CHAT_DRAFTS_STORAGE_KEY);
  },
};

/**
 * 集中管理聊天草稿与发送快捷键状态。
 */
export const useChatUiStore = create<ChatUiState>()(
  persist(
    (set) => ({
      draftsBySession: {},
      sendShortcut: "enter",
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
