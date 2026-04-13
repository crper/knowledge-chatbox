/**
 * @file 全局状态模块。
 */

import { create } from "zustand";
import { persist, type PersistStorage, type StorageValue } from "zustand/middleware";

import {
  DEFAULT_LANGUAGE,
  DEFAULT_THEME,
  LANGUAGE_STORAGE_KEY,
  THEME_MODES,
  THEME_STORAGE_KEY,
  type AppLanguage,
  type ThemeMode,
} from "@/lib/config/constants";
import { isValidLanguage } from "@/i18n";

const UI_STORE_STORAGE_KEY = "knowledge-chatbox-ui-store";

type UiState = {
  language: AppLanguage;
  theme: ThemeMode;
  setLanguage: (language: AppLanguage) => void;
  setTheme: (theme: ThemeMode) => void;
};

type PersistedUiState = Pick<UiState, "language" | "theme">;

function readPersistedLanguage(): AppLanguage {
  if (typeof window === "undefined") {
    return DEFAULT_LANGUAGE;
  }

  const value = window.localStorage.getItem(LANGUAGE_STORAGE_KEY);
  return value && isValidLanguage(value) ? value : DEFAULT_LANGUAGE;
}

function readPersistedTheme(): ThemeMode {
  if (typeof window === "undefined") {
    return DEFAULT_THEME;
  }

  const value = window.localStorage.getItem(THEME_STORAGE_KEY);
  return value && (THEME_MODES as readonly string[]).includes(value)
    ? (value as ThemeMode)
    : DEFAULT_THEME;
}

const uiStoreStorage: PersistStorage<PersistedUiState> = {
  getItem: () => ({
    state: {
      language: readPersistedLanguage(),
      theme: readPersistedTheme(),
    },
  }),
  setItem: (_name, value: StorageValue<PersistedUiState>) => {
    if (typeof window === "undefined") {
      return;
    }

    window.localStorage.setItem(LANGUAGE_STORAGE_KEY, value.state.language);
    window.localStorage.setItem(THEME_STORAGE_KEY, value.state.theme);
  },
  removeItem: () => {
    if (typeof window === "undefined") {
      return;
    }

    window.localStorage.removeItem(LANGUAGE_STORAGE_KEY);
    window.localStorage.removeItem(THEME_STORAGE_KEY);
  },
};

/**
 * 集中管理全局 UI 状态。
 */
export const useUiStore = create<UiState>()(
  persist(
    (set) => ({
      language: DEFAULT_LANGUAGE,
      theme: DEFAULT_THEME,
      setLanguage: (language) => set({ language }),
      setTheme: (theme) => set({ theme }),
    }),
    {
      name: UI_STORE_STORAGE_KEY,
      partialize: (state) => ({
        language: state.language,
        theme: state.theme,
      }),
      storage: uiStoreStorage,
    },
  ),
);
