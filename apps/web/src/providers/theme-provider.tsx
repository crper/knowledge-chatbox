/**
 * @file 主题 Provider 模块。
 */

import {
  createContext,
  useContext,
  useEffect,
  useEffectEvent,
  useLayoutEffect,
  useMemo,
} from "react";
import type { PropsWithChildren } from "react";

import { type ThemeMode } from "@/lib/config/constants";
import { useUiStore } from "@/lib/store/ui-store";

type ThemeContextValue = {
  resolvedTheme: "light" | "dark";
  setTheme: (theme: ThemeMode) => void;
  theme: ThemeMode;
};

const ThemeContext = createContext<ThemeContextValue | null>(null);

function resolveTheme(theme: ThemeMode) {
  if (theme === "system") {
    return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
  }

  return theme;
}

function applyTheme(theme: ThemeMode) {
  const resolvedTheme = resolveTheme(theme);

  document.documentElement.classList.toggle("dark", resolvedTheme === "dark");
  document.documentElement.style.colorScheme = resolvedTheme;
}

/**
 * 为子树提供主题状态。
 */
export function ThemeProvider({ children }: PropsWithChildren) {
  const theme = useUiStore((state) => state.theme);
  const setTheme = useUiStore((state) => state.setTheme);

  useLayoutEffect(() => {
    applyTheme(theme);
  }, [theme]);

  const handleSystemThemeChange = useEffectEvent(() => {
    if (useUiStore.getState().theme === "system") {
      applyTheme("system");
    }
  });

  useEffect(() => {
    const mediaQueryList = window.matchMedia("(prefers-color-scheme: dark)");

    mediaQueryList.addEventListener("change", handleSystemThemeChange);
    return () => {
      mediaQueryList.removeEventListener("change", handleSystemThemeChange);
    };
  }, [handleSystemThemeChange]);

  const value = useMemo<ThemeContextValue>(
    () => ({
      resolvedTheme: resolveTheme(theme),
      setTheme,
      theme,
    }),
    [setTheme, theme],
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

/**
 * 读取并更新当前主题模式。
 */
export function useTheme() {
  const context = useContext(ThemeContext);

  if (!context) {
    throw new Error("useTheme must be used within ThemeProvider");
  }

  return context;
}
