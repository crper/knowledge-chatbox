/**
 * @file 登录主题同步存储模块。
 */

import { THEME_SYNC_ON_LOGIN_STORAGE_KEY, type ThemeMode } from "./constants";

export function resolvePendingThemeSync(themePreference: ThemeMode) {
  const pendingTheme = readPendingThemeSync();

  return {
    pendingTheme,
    resolvedTheme:
      pendingTheme !== null && pendingTheme !== themePreference ? pendingTheme : themePreference,
    shouldClearPendingTheme: pendingTheme === null || pendingTheme === themePreference,
  };
}

export function readPendingThemeSync(): ThemeMode | null {
  if (typeof window === "undefined") {
    return null;
  }

  const value = window.sessionStorage.getItem(THEME_SYNC_ON_LOGIN_STORAGE_KEY);
  return value === "light" || value === "dark" || value === "system" ? value : null;
}

export function writePendingThemeSync(theme: ThemeMode) {
  if (typeof window === "undefined") {
    return;
  }

  window.sessionStorage.setItem(THEME_SYNC_ON_LOGIN_STORAGE_KEY, theme);
}

export function clearPendingThemeSync() {
  if (typeof window === "undefined") {
    return;
  }

  window.sessionStorage.removeItem(THEME_SYNC_ON_LOGIN_STORAGE_KEY);
}
