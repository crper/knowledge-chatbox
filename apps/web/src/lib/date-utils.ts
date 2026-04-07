/**
 * @file 日期处理工具模块。
 */

import {
  addDays,
  addHours,
  addMinutes,
  differenceInDays,
  differenceInHours,
  differenceInMinutes,
  differenceInSeconds,
  endOfDay,
  endOfMonth,
  endOfWeek,
  format,
  formatDistanceToNow as formatDistanceToNowFns,
  formatRelative,
  getDate,
  getDay,
  getMonth,
  getYear,
  isAfter,
  isBefore,
  isEqual,
  isSameDay,
  isToday,
  isTomorrow,
  isValid,
  isWeekend,
  isYesterday,
  parse,
  parseISO,
  setDate,
  setMonth,
  setYear,
  startOfDay,
  startOfMonth,
  startOfWeek,
  subDays,
} from "date-fns";

import { getDateFnsLocale } from "./date-locale";

export const DATE_FORMAT = "yyyy-MM-dd";
export const TIME_FORMAT = "HH:mm:ss";
export const DATETIME_FORMAT = "yyyy-MM-dd HH:mm:ss";
export const DATETIME_SHORT_FORMAT = "MM-dd HH:mm";
export const ISO_DATE_FORMAT = "yyyy-MM-dd'T'HH:mm:ss";

type DateInput = Date | string | number;

export function toDate(date: DateInput): Date | null {
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

export function isValidDate(date: unknown): date is Date {
  return date instanceof Date && isValid(date);
}

export function formatDate(
  date: DateInput,
  formatStr: string = DATE_FORMAT,
  locale?: string,
): string {
  const dateObj = toDate(date);
  if (!dateObj || !isValid(dateObj)) {
    return "";
  }

  return format(dateObj, formatStr, { locale: getDateFnsLocale(locale) });
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

export function formatTime(date: DateInput, locale?: string): string {
  return formatDate(date, TIME_FORMAT, locale);
}

export function formatShortDateTime(date: DateInput, locale?: string): string {
  return formatDate(date, DATETIME_SHORT_FORMAT, locale);
}

export function formatRelativeTime(date: DateInput, locale?: string): string {
  const dateObj = toDate(date);
  if (!dateObj || !isValid(dateObj)) {
    return "";
  }

  return formatRelative(dateObj, new Date(), { locale: getDateFnsLocale(locale) });
}

export function formatDistanceToNow(date: DateInput, locale?: string): string {
  const dateObj = toDate(date);
  if (!dateObj || !isValid(dateObj)) {
    return "";
  }

  return formatDistanceToNowFns(dateObj, { addSuffix: true, locale: getDateFnsLocale(locale) });
}

export function parseDate(
  dateString: string,
  formatStr: string,
  referenceDate?: Date,
): Date | null {
  const parsed = parse(dateString, formatStr, referenceDate || new Date());
  return isValid(parsed) ? parsed : null;
}

export function parseISODate(dateString: string): Date | null {
  const parsed = parseISO(dateString);
  return isValid(parsed) ? parsed : null;
}

export function isBeforeDate(date: DateInput, dateToCompare: DateInput): boolean {
  const dateObj = toDate(date);
  const compareObj = toDate(dateToCompare);

  if (!dateObj || !compareObj) {
    return false;
  }

  return isBefore(dateObj, compareObj);
}

export function isAfterDate(date: DateInput, dateToCompare: DateInput): boolean {
  const dateObj = toDate(date);
  const compareObj = toDate(dateToCompare);

  if (!dateObj || !compareObj) {
    return false;
  }

  return isAfter(dateObj, compareObj);
}

export function isSameDayDate(dateLeft: DateInput, dateRight: DateInput): boolean {
  const leftObj = toDate(dateLeft);
  const rightObj = toDate(dateRight);

  if (!leftObj || !rightObj) {
    return false;
  }

  return isSameDay(leftObj, rightObj);
}

export function isWithinRange(date: DateInput, start: DateInput, end: DateInput): boolean {
  const dateObj = toDate(date);
  const startObj = toDate(start);
  const endObj = toDate(end);

  if (!dateObj || !startObj || !endObj) {
    return false;
  }

  return !isBefore(dateObj, startObj) && !isAfter(dateObj, endObj);
}

export function addDaysToDate(date: DateInput, amount: number): Date | null {
  const dateObj = toDate(date);
  if (!dateObj) {
    return null;
  }

  return addDays(dateObj, amount);
}

export function subtractDaysFromDate(date: DateInput, amount: number): Date | null {
  const dateObj = toDate(date);
  if (!dateObj) {
    return null;
  }

  return subDays(dateObj, amount);
}

export function startOfDayDate(date: DateInput): Date | null {
  const dateObj = toDate(date);
  if (!dateObj) {
    return null;
  }

  return startOfDay(dateObj);
}

export function endOfDayDate(date: DateInput): Date | null {
  const dateObj = toDate(date);
  if (!dateObj) {
    return null;
  }

  return endOfDay(dateObj);
}

export type CountdownResult = {
  days: number;
  hours: number;
  minutes: number;
  seconds: number;
  isExpired: boolean;
};

export function getCountdown(
  targetDate: DateInput,
  currentDate: DateInput = new Date(),
): CountdownResult {
  const target = toDate(targetDate);
  const current = toDate(currentDate);

  if (!target || !current) {
    return {
      days: 0,
      hours: 0,
      minutes: 0,
      seconds: 0,
      isExpired: true,
    };
  }

  const isExpired = isBefore(target, current);

  if (isExpired) {
    return {
      days: 0,
      hours: 0,
      minutes: 0,
      seconds: 0,
      isExpired: true,
    };
  }

  const days = differenceInDays(target, current);
  const hours = differenceInHours(target, current) % 24;
  const minutes = differenceInMinutes(target, current) % 60;
  const seconds = differenceInSeconds(target, current) % 60;

  return {
    days,
    hours,
    minutes,
    seconds,
    isExpired: false,
  };
}

export function formatCountdown(countdown: CountdownResult): string {
  if (countdown.isExpired) {
    return "已过期";
  }

  const parts: string[] = [];

  if (countdown.days > 0) {
    parts.push(`${countdown.days}天`);
  }

  if (countdown.hours > 0 || countdown.days > 0) {
    parts.push(`${countdown.hours}小时`);
  }

  if (countdown.minutes > 0 || countdown.hours > 0 || countdown.days > 0) {
    parts.push(`${countdown.minutes}分钟`);
  }

  parts.push(`${countdown.seconds}秒`);

  return parts.join(" ");
}

export type DateRange = {
  start: Date;
  end: Date;
  label: string;
};

export function getPresetDateRanges(): DateRange[] {
  const now = new Date();
  const today = startOfDay(now);
  const todayEnd = endOfDay(now);

  return [
    {
      start: today,
      end: todayEnd,
      label: "今天",
    },
    {
      start: startOfDay(subDays(now, 1)),
      end: endOfDay(subDays(now, 1)),
      label: "昨天",
    },
    {
      start: startOfDay(subDays(now, 7)),
      end: todayEnd,
      label: "最近7天",
    },
    {
      start: startOfDay(subDays(now, 30)),
      end: todayEnd,
      label: "最近30天",
    },
    {
      start: startOfDay(subDays(now, 90)),
      end: todayEnd,
      label: "最近90天",
    },
  ];
}

export function formatDateRange(start: Date, end: Date, locale?: string): string {
  const startStr = formatDate(start, DATE_FORMAT, locale);
  const endStr = formatDate(end, DATE_FORMAT, locale);

  if (startStr === endStr) {
    return startStr;
  }

  return `${startStr} 至 ${endStr}`;
}

export function formatSmartTime(date: DateInput, locale?: string): string {
  const dateObj = toDate(date);
  if (!dateObj || !isValid(dateObj)) {
    return "";
  }

  const now = new Date();
  const diffMinutes = differenceInMinutes(now, dateObj);
  const diffHours = differenceInHours(now, dateObj);
  const diffDays = differenceInDays(now, dateObj);

  if (diffMinutes < 1) {
    return "刚刚";
  }

  if (diffMinutes < 60) {
    return `${diffMinutes}分钟前`;
  }

  if (diffHours < 24) {
    return `${diffHours}小时前`;
  }

  if (diffDays < 7) {
    return `${diffDays}天前`;
  }

  return formatDate(dateObj, DATETIME_SHORT_FORMAT, locale);
}

export function addHoursToDate(date: DateInput, amount: number): Date | null {
  const dateObj = toDate(date);
  if (!dateObj) {
    return null;
  }

  return addHours(dateObj, amount);
}

export function addMinutesToDate(date: DateInput, amount: number): Date | null {
  const dateObj = toDate(date);
  if (!dateObj) {
    return null;
  }

  return addMinutes(dateObj, amount);
}

export function isTodayDate(date: DateInput): boolean {
  const dateObj = toDate(date);
  return dateObj ? isToday(dateObj) : false;
}

export function isYesterdayDate(date: DateInput): boolean {
  const dateObj = toDate(date);
  return dateObj ? isYesterday(dateObj) : false;
}

export function isTomorrowDate(date: DateInput): boolean {
  const dateObj = toDate(date);
  return dateObj ? isTomorrow(dateObj) : false;
}

export function isWeekendDate(date: DateInput): boolean {
  const dateObj = toDate(date);
  return dateObj ? isWeekend(dateObj) : false;
}

export function startOfMonthDate(date: DateInput): Date | null {
  const dateObj = toDate(date);
  return dateObj ? startOfMonth(dateObj) : null;
}

export function endOfMonthDate(date: DateInput): Date | null {
  const dateObj = toDate(date);
  return dateObj ? endOfMonth(dateObj) : null;
}

export function startOfWeekDate(date: DateInput, locale?: string): Date | null {
  const dateObj = toDate(date);
  return dateObj ? startOfWeek(dateObj, { locale: getDateFnsLocale(locale) }) : null;
}

export function endOfWeekDate(date: DateInput, locale?: string): Date | null {
  const dateObj = toDate(date);
  return dateObj ? endOfWeek(dateObj, { locale: getDateFnsLocale(locale) }) : null;
}

export function getYearFromDate(date: DateInput): number | null {
  const dateObj = toDate(date);
  return dateObj ? getYear(dateObj) : null;
}

export function getMonthFromDate(date: DateInput): number | null {
  const dateObj = toDate(date);
  return dateObj ? getMonth(dateObj) : null;
}

export function getDateFromDate(date: DateInput): number | null {
  const dateObj = toDate(date);
  return dateObj ? getDate(dateObj) : null;
}

export function getDayFromDate(date: DateInput): number | null {
  const dateObj = toDate(date);
  return dateObj ? getDay(dateObj) : null;
}

export function setYearToDate(date: DateInput, year: number): Date | null {
  const dateObj = toDate(date);
  return dateObj ? setYear(dateObj, year) : null;
}

export function setMonthToDate(date: DateInput, month: number): Date | null {
  const dateObj = toDate(date);
  return dateObj ? setMonth(dateObj, month) : null;
}

export function setDateToDate(date: DateInput, day: number): Date | null {
  const dateObj = toDate(date);
  return dateObj ? setDate(dateObj, day) : null;
}

export function isEqualDate(dateLeft: DateInput, dateRight: DateInput): boolean {
  const leftObj = toDate(dateLeft);
  const rightObj = toDate(dateRight);

  if (!leftObj || !rightObj) {
    return false;
  }

  return isEqual(leftObj, rightObj);
}
