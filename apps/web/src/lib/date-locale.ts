/**
 * @file 日期 locale 映射模块。
 */

import { enUS, zhCN } from "date-fns/locale";

import type { AppLanguage } from "@/lib/config/constants";

type DateFnsLocale = typeof zhCN;

const localeMap: Record<AppLanguage, DateFnsLocale> = {
  "zh-CN": zhCN,
  en: enUS,
};

/**
 * 获取 date-fns locale 对象。
 */
export function getDateFnsLocale(locale?: string): DateFnsLocale {
  const appLanguage = (locale as AppLanguage) || "zh-CN";
  return localeMap[appLanguage] || localeMap["zh-CN"];
}
