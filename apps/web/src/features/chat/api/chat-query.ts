/**
 * @file 聊天查询配置模块。
 */

import { queryOptions, skipToken } from "@tanstack/react-query";

import { queryKeys } from "@/lib/api/query-keys";
import { getChatMessages, getChatProfile, getChatSessions } from "./chat";

/**
 * 获取聊天会话查询配置。
 */
export function chatSessionsQueryOptions() {
  return queryOptions({
    queryKey: queryKeys.chat.sessions,
    queryFn: getChatSessions,
  });
}

/**
 * 获取当前聊天配置查询配置。
 */
export function chatProfileQueryOptions() {
  return queryOptions({
    queryKey: queryKeys.chat.profile,
    queryFn: getChatProfile,
  });
}

/**
 * 获取聊天消息查询配置。
 */
export function chatMessagesQueryOptions(sessionId: number | null) {
  return queryOptions({
    queryKey: queryKeys.chat.messages(sessionId),
    queryFn: sessionId === null ? skipToken : () => getChatMessages(sessionId),
  });
}
