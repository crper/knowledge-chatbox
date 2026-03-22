/**
 * @file 聊天会话路由工具模块。
 */

const CHAT_ROUTE_PREFIX = "/chat/";

/**
 * 构建聊天会话详情路由。
 */
export function buildChatSessionPath(sessionId: number) {
  return `${CHAT_ROUTE_PREFIX}${sessionId}`;
}

/**
 * 解析路由参数中的会话 ID。
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
 * 从 pathname 中提取聊天会话 ID。
 */
export function parseChatSessionIdFromPathname(pathname: string) {
  if (!pathname.startsWith(CHAT_ROUTE_PREFIX)) {
    return null;
  }

  return parseChatSessionId(pathname.slice(CHAT_ROUTE_PREFIX.length));
}
