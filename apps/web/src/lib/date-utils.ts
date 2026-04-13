import { format, isValid, toDate } from "date-fns";
import type { Locale } from "date-fns/locale";
import { zhCN } from "date-fns/locale";
import { useTranslation } from "react-i18next";

type DateInput = Date | string | number;

export function resolveDateLocale(language: string | undefined): Locale | undefined {
  return language === "zh-CN" ? zhCN : undefined;
}

export function useDateLocale(): Locale | undefined {
  const { i18n } = useTranslation();
  return resolveDateLocale(i18n.resolvedLanguage);
}

export function formatDateTime(date: DateInput, locale?: Locale): string {
  const d = toDate(date);
  if (!isValid(d)) return "";
  return format(d, "yyyy/MM/dd HH:mm", { locale });
}
