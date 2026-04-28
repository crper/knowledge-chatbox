/**
 * @file 国际化模块。
 */

import i18n from "i18next";
import { initReactI18next } from "react-i18next";

import zhAuth from "./locales/zh-CN/auth.json";
import zhChat from "./locales/zh-CN/chat.json";
import zhCommon from "./locales/zh-CN/common.json";
import zhKnowledge from "./locales/zh-CN/knowledge.json";
import zhSettings from "./locales/zh-CN/settings.json";
import zhUsers from "./locales/zh-CN/users.json";
import enAuth from "./locales/en/auth.json";
import enChat from "./locales/en/chat.json";
import enCommon from "./locales/en/common.json";
import enKnowledge from "./locales/en/knowledge.json";
import enSettings from "./locales/en/settings.json";
import enUsers from "./locales/en/users.json";

const SUPPORTED_LANGUAGES = ["zh-CN", "en"] as const;

const RTL_LANGUAGES: readonly string[] = [];

export type AppLanguage = (typeof SUPPORTED_LANGUAGES)[number];

export function isRtlLanguage(language: string): boolean {
  return RTL_LANGUAGES.includes(language);
}

export function detectBrowserLanguage(): AppLanguage | null {
  if (typeof window === "undefined" || typeof navigator === "undefined") {
    return null;
  }

  const browserLanguages = [...navigator.languages, navigator.language];

  for (const browserLang of browserLanguages) {
    const normalized = browserLang.toLowerCase();

    const exactMatch = SUPPORTED_LANGUAGES.find(
      (supported) => supported.toLowerCase() === normalized,
    );
    if (exactMatch) return exactMatch;

    const prefixMatch = SUPPORTED_LANGUAGES.find((supported) =>
      supported.toLowerCase().startsWith(normalized.split("-")[0]!),
    );
    if (prefixMatch) return prefixMatch;
  }

  return null;
}

export function getSupportedLanguages(): readonly AppLanguage[] {
  return SUPPORTED_LANGUAGES;
}

export function isValidLanguage(value: string): value is AppLanguage {
  return (SUPPORTED_LANGUAGES as readonly string[]).includes(value);
}

if (!i18n.isInitialized) {
  void i18n.use(initReactI18next).init({
    lng: "zh-CN",
    fallbackLng: "zh-CN",
    ns: ["common", "auth", "users", "knowledge", "chat", "settings"],
    defaultNS: "common",
    resources: {
      "zh-CN": {
        common: zhCommon,
        auth: zhAuth,
        users: zhUsers,
        knowledge: zhKnowledge,
        chat: zhChat,
        settings: zhSettings,
      },
      en: {
        common: enCommon,
        auth: enAuth,
        users: enUsers,
        knowledge: enKnowledge,
        chat: enChat,
        settings: enSettings,
      },
    },
    interpolation: {
      escapeValue: false,
    },
    missingKeyHandler: (_lngs, ns, key) => {
      if (import.meta.env.DEV) {
        console.warn(`[i18n] Missing key: ${ns}:${key}`);
      }
    },
  });
}

export { i18n };
