/**
 * @file 主题状态 Hook 与 Provider 模块。
 */

import { type PropsWithChildren, useLayoutEffect, useSyncExternalStore } from "react";

import { type ThemeMode } from "@/lib/config/constants";
import { useUiStore } from "@/lib/store/ui-store";

const SYSTEM_DARK_MEDIA_QUERY = "(prefers-color-scheme: dark)";

function getSystemDarkSnapshot() {
  return window.matchMedia(SYSTEM_DARK_MEDIA_QUERY).matches;
}

function getServerSnapshot() {
  return false;
}

function subscribeSystemDark(callback: () => void) {
  const mql = window.matchMedia(SYSTEM_DARK_MEDIA_QUERY);
  mql.addEventListener("change", callback);
  return () => mql.removeEventListener("change", callback);
}

function resolveTheme(theme: ThemeMode, isSystemDark: boolean): "light" | "dark" {
  if (theme === "system") {
    return isSystemDark ? "dark" : "light";
  }
  return theme;
}

function applyTheme(resolvedTheme: "light" | "dark") {
  document.documentElement.classList.toggle("dark", resolvedTheme === "dark");
  document.documentElement.style.colorScheme = resolvedTheme;
}

/**
 * 读取并更新当前主题模式，直接从 zustand store 获取。
 */
export function useTheme() {
  const theme = useUiStore((state) => state.theme);
  const setTheme = useUiStore((state) => state.setTheme);
  return { setTheme, theme };
}

/**
 * 获取解析后的主题（light/dark），考虑 system 偏好。
 */
export function useResolvedTheme() {
  const theme = useUiStore((state) => state.theme);
  const isSystemDark = useSyncExternalStore(
    subscribeSystemDark,
    getSystemDarkSnapshot,
    getServerSnapshot,
  );
  return resolveTheme(theme, isSystemDark);
}

/**
 * 将解析后的主题应用到 DOM，应在应用根组件调用。
 */
export function useThemeEffect() {
  const resolvedTheme = useResolvedTheme();
  useLayoutEffect(() => {
    applyTheme(resolvedTheme);
  }, [resolvedTheme]);
}

/**
 * 主题 Provider 组件，将主题效果应用到 DOM 并渲染子组件。
 * 内部调用 useThemeEffect，无需 Context 层。
 * 生产代码通过 AppProviders 直接调用 useThemeEffect()；
 * 此组件保留供测试场景作为 wrapper 使用。
 */
export function ThemeProvider({ children }: PropsWithChildren) {
  useThemeEffect();
  return <>{children}</>;
}
