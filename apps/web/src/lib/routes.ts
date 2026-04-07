/**
 * @file 路由路径帮助模块。
 */

const SETTINGS_SECTION_IDS = [
  "preferences",
  "security",
  "providers",
  "prompt",
  "management",
] as const;

export type SettingsRouteSection = (typeof SETTINGS_SECTION_IDS)[number];

export const CHAT_INDEX_PATH = "/chat";
export const LOGIN_PATH = "/login";
export const KNOWLEDGE_INDEX_PATH = "/knowledge";
export const SETTINGS_INDEX_PATH = "/settings";
export const ADMIN_USERS_PATH = "/admin/users";
export const FORBIDDEN_PATH = "/403";

const CHAT_ROUTE_PREFIX = `${CHAT_INDEX_PATH}/`;
const SETTINGS_ROUTE_PREFIX = `${SETTINGS_INDEX_PATH}/`;

/**
 * 构建设置分区路径。
 */
export function buildSettingsPath(section: SettingsRouteSection) {
  return `${SETTINGS_ROUTE_PREFIX}${section}`;
}

/**
 * 构建旧版 settings search 路径，供兼容跳转和回归测试使用。
 */
export function buildLegacySettingsSearchPath(section: SettingsRouteSection) {
  return `${SETTINGS_INDEX_PATH}?section=${section}`;
}

/**
 * 构建聊天会话路径。
 */
export function buildChatSessionPath(sessionId: number) {
  return `${CHAT_ROUTE_PREFIX}${sessionId}`;
}

/**
 * 解析聊天会话 ID。
 */
export function parseChatSessionId(value: string | null | undefined) {
  if (!value) {
    return null;
  }

  const sessionId = Number(value);
  if (!Number.isInteger(sessionId) || sessionId <= 0) {
    return null;
  }

  return sessionId;
}

/**
 * 从聊天路径提取会话 ID。
 */
export function parseChatSessionPathname(pathname: string) {
  if (!pathname.startsWith(CHAT_ROUTE_PREFIX)) {
    return null;
  }

  return parseChatSessionId(pathname.slice(CHAT_ROUTE_PREFIX.length));
}

/**
 * 从规范 settings 路径解析分区。
 */
export function normalizeSettingsSectionPath(pathname: string) {
  if (!pathname.startsWith(SETTINGS_ROUTE_PREFIX)) {
    return null;
  }

  const section = pathname.slice(SETTINGS_ROUTE_PREFIX.length);
  return SETTINGS_SECTION_IDS.includes(section as SettingsRouteSection)
    ? (section as SettingsRouteSection)
    : null;
}
