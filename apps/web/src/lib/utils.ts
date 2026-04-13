/**
 * @file 前端模块。
 */

import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

/**
 * 合并并规范化 Tailwind 类名。
 */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * 从未知错误中提取可读消息，非 Error 实例时返回 fallback。
 */
export function getErrorMessage(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback;
}

/**
 * 判断未知错误是否为主动中断导致的 AbortError。
 * 优先使用 DOMException 精确匹配，兼容非浏览器运行时。
 */
export function isAbortError(error: unknown): error is DOMException {
  return error instanceof DOMException && error.name === "AbortError";
}

const FILE_SIZE_UNITS = ["B", "KB", "MB", "GB"] as const;

export function formatFileSize(bytes: number | null | undefined) {
  if (typeof bytes !== "number" || Number.isNaN(bytes) || bytes < 0) {
    return null;
  }

  if (bytes === 0) {
    return "0 B";
  }

  let value = bytes;
  let unitIndex = 0;

  while (value >= 1024 && unitIndex < FILE_SIZE_UNITS.length - 1) {
    value /= 1024;
    unitIndex += 1;
  }

  const unit = FILE_SIZE_UNITS[unitIndex];
  return unitIndex === 0 ? `${value} ${unit}` : `${value.toFixed(1)} ${unit}`;
}
