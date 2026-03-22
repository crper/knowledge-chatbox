/**
 * @file 国际化 Provider 模块。
 */

import { useEffect } from "react";
import type { PropsWithChildren } from "react";
import { I18nextProvider } from "react-i18next";

import { i18n } from "@/i18n";
import { useUiStore } from "@/lib/store/ui-store";

/**
 * 为子树提供国际化上下文。
 */
export function I18nProvider({ children }: PropsWithChildren) {
  const language = useUiStore((state) => state.language);

  useEffect(() => {
    void i18n.changeLanguage(language);
  }, [language]);

  return <I18nextProvider i18n={i18n}>{children}</I18nextProvider>;
}
