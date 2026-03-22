/**
 * @file Store 同步 Provider 模块。
 */

import { useEffect } from "react";

import {
  CHAT_DRAFTS_STORAGE_KEY,
  CHAT_SEND_SHORTCUT_STORAGE_KEY,
  useChatUiStore,
} from "@/features/chat/store/chat-ui-store";
import { LANGUAGE_STORAGE_KEY, THEME_STORAGE_KEY } from "@/lib/config/constants";
import { useUiStore } from "@/lib/store/ui-store";

const UI_STORE_SYNC_KEYS = new Set([LANGUAGE_STORAGE_KEY, THEME_STORAGE_KEY]);
const CHAT_UI_STORE_SYNC_KEYS = new Set([CHAT_DRAFTS_STORAGE_KEY, CHAT_SEND_SHORTCUT_STORAGE_KEY]);

/**
 * 监听跨标签页 storage 事件并触发本地 store 重载。
 */
export function StoreSyncProvider() {
  useEffect(() => {
    void useUiStore.persist.rehydrate();
    void useChatUiStore.persist.rehydrate();

    const handleStorage = (event: StorageEvent) => {
      if (event.storageArea !== window.localStorage || !event.key) {
        return;
      }

      if (UI_STORE_SYNC_KEYS.has(event.key)) {
        void useUiStore.persist.rehydrate();
      }

      if (CHAT_UI_STORE_SYNC_KEYS.has(event.key)) {
        void useChatUiStore.persist.rehydrate();
      }
    };

    window.addEventListener("storage", handleStorage);
    return () => window.removeEventListener("storage", handleStorage);
  }, []);

  return null;
}
