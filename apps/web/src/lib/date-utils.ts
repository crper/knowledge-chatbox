/**
 * @file 日期处理工具模块。
 */

import { isValid, parseISO } from "date-fns";

type DateInput = Date | string | number;

function toDate(date: DateInput): Date | null {
  if (date instanceof Date) {
    return date;
  }

  if (typeof date === "number") {
    return new Date(date);
  }

  if (typeof date === "string") {
    const parsed = parseISO(date);
    return isValid(parsed) ? parsed : null;
  }

  return null;
}

export function formatDateTime(date: DateInput, locale?: string): string {
  const dateObj = toDate(date);
  if (!dateObj || !isValid(dateObj)) {
    return "";
  }

  return new Intl.DateTimeFormat(locale, {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(dateObj);
}
