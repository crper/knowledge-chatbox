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
  });
}

export { i18n };
