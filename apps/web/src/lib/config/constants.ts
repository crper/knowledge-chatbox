/**
 * @file 前端配置模块。
 */

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
export const DEFAULT_LANGUAGE = "zh-CN";

/**
 * 描述主题模式的数据结构。
 */
export type ThemeMode = "light" | "dark" | "system";
/**
 * 描述应用语言的数据结构。
 */
export type AppLanguage = "zh-CN" | "en";
