/**
 * @file 国际化 Provider 模块。
 */

import { useEffect, useState } from "react";
import type { PropsWithChildren } from "react";
import { I18nextProvider } from "react-i18next";

import { i18n, isRtlLanguage, isValidLanguage, type AppLanguage } from "@/i18n";
import { LANGUAGE_STORAGE_KEY, DEFAULT_LANGUAGE } from "@/lib/config/constants";
import { useUiStore } from "@/lib/store/ui-store";

function applyDocumentDirection(language: string) {
  if (typeof document === "undefined") return;
  document.documentElement.dir = isRtlLanguage(language) ? "rtl" : "ltr";
}

function resolveInitialLanguage(): string {
  if (typeof window === "undefined") return DEFAULT_LANGUAGE;
  const stored = window.localStorage.getItem(LANGUAGE_STORAGE_KEY);
  if (stored && isValidLanguage(stored)) return stored;
  const browserLang = navigator.language;
  if (isValidLanguage(browserLang)) return browserLang;
  return DEFAULT_LANGUAGE;
}

/**
 * 为子树提供国际化上下文。
 * zustand persist rehydration 是异步的，首次渲染时 store 可能尚未恢复，
 * 因此通过 resolveInitialLanguage 直接读取 localStorage 作为兜底。
 */
export function I18nProvider({ children }: PropsWithChildren) {
  const language = useUiStore((state) => state.language);
  const setLanguage = useUiStore((state) => state.setLanguage);
  const [initialized, setInitialized] = useState(false);

  useEffect(() => {
    if (!initialized) {
      const initial = resolveInitialLanguage();
      if (initial !== language) {
        setLanguage(initial as AppLanguage);
      }
      void i18n.changeLanguage(initial);
      applyDocumentDirection(initial);
      setInitialized(true);
      return;
    }

    void i18n.changeLanguage(language);
    applyDocumentDirection(language);
  }, [language, initialized, setLanguage]);

  return <I18nextProvider i18n={i18n}>{children}</I18nextProvider>;
}
