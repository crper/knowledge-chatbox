/**
 * @file 前端配置模块。
 */

import { type AppLanguage } from "@/i18n";

/**
 * 定义主题偏好的本地存储键。
 */
export const THEME_STORAGE_KEY = "knowledge-chatbox-theme";
export const THEME_SYNC_ON_LOGIN_STORAGE_KEY = "knowledge-chatbox-theme-sync-on-login";
/**
 * 定义默认主题模式。
 */
export const DEFAULT_THEME = "system";
/**
 * 定义语言偏好的本地存储键。
 */
export const LANGUAGE_STORAGE_KEY = "knowledge-chatbox-language";
/**
 * 定义默认语言。
 */
export const DEFAULT_LANGUAGE: AppLanguage = "zh-CN";

/**
 * 描述主题模式的数据结构。
 */
export type ThemeMode = "light" | "dark" | "system";

/**
 * 主题模式合法值数组，用于运行时校验。
 */
export const THEME_MODES = ["light", "dark", "system"] as const;

export type { AppLanguage };
