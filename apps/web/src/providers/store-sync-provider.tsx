/**
 * @file Store 同步 Provider 模块。
 */

import { useEffect } from "react";

import {
  CHAT_DRAFTS_STORAGE_KEY,
  CHAT_SEND_SHORTCUT_STORAGE_KEY,
  useChatComposerStore,
} from "@/features/chat/store/chat-composer-store";
import { LANGUAGE_STORAGE_KEY, THEME_STORAGE_KEY } from "@/lib/config/constants";
import { useUiStore } from "@/lib/store/ui-store";

const UI_STORE_SYNC_KEYS = new Set([LANGUAGE_STORAGE_KEY, THEME_STORAGE_KEY]);
const CHAT_COMPOSER_STORE_SYNC_KEYS = new Set([
  CHAT_DRAFTS_STORAGE_KEY,
  CHAT_SEND_SHORTCUT_STORAGE_KEY,
]);

/**
 * 监听跨标签页 storage 事件并触发本地 store 重载。
 */
export function useStoreSync() {
  useEffect(() => {
    const handleStorage = (event: StorageEvent) => {
      if (event.storageArea !== window.localStorage || !event.key) {
        return;
      }

      if (UI_STORE_SYNC_KEYS.has(event.key)) {
        void useUiStore.persist.rehydrate();
      }

      if (CHAT_COMPOSER_STORE_SYNC_KEYS.has(event.key)) {
        void useChatComposerStore.persist.rehydrate();
      }
    };

    window.addEventListener("storage", handleStorage);
    return () => window.removeEventListener("storage", handleStorage);
  }, []);
}

/**
 * Store 同步 Provider 组件。
 * 生产代码通过 AppProviders 直接调用 useStoreSync()；
 * 此组件保留供测试场景作为 wrapper 使用。
 */
export function StoreSyncProvider() {
  useStoreSync();
  return null;
}
