/**
 * @file 聊天会话恢复工具模块。
 */

import { parseChatSessionId } from "@/lib/routes";

export const LAST_VISITED_CHAT_SESSION_STORAGE_KEY = "knowledge-chatbox-last-chat-session-id";

type ChatSessionCandidate = {
  id: number;
};

/**
 * 读取最近访问的聊天会话 ID。
 */
export function readLastVisitedChatSessionId() {
  if (typeof window === "undefined") {
    return null;
  }

  return parseChatSessionId(window.localStorage.getItem(LAST_VISITED_CHAT_SESSION_STORAGE_KEY));
}

/**
 * 持久化最近访问的聊天会话 ID。
 */
export function writeLastVisitedChatSessionId(sessionId: number) {
  if (typeof window === "undefined") {
    return;
  }

  window.localStorage.setItem(LAST_VISITED_CHAT_SESSION_STORAGE_KEY, String(sessionId));
}

/**
 * 清理最近访问的聊天会话 ID。
 */
export function clearLastVisitedChatSessionId() {
  if (typeof window === "undefined") {
    return;
  }

  window.localStorage.removeItem(LAST_VISITED_CHAT_SESSION_STORAGE_KEY);
}

/**
 * 解析聊天入口页应恢复到哪个会话。
 */
export function resolveRestorableChatSessionId(
  sessions: ChatSessionCandidate[],
  preferredSessionId: number | null,
) {
  if (
    preferredSessionId !== null &&
    sessions.some((session) => session.id === preferredSessionId)
  ) {
    return preferredSessionId;
  }

  return sessions[0]?.id ?? null;
}
