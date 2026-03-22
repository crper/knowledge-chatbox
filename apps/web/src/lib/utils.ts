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
