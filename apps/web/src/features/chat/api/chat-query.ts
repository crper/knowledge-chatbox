/**
 * @file 聊天查询配置模块。
 */

import { queryOptions, skipToken } from "@tanstack/react-query";

import { queryKeys } from "@/lib/api/query-keys";
import { getChatMessages, getChatProfile, getChatSessionContext, getChatSessions } from "./chat";

const CHAT_CONTEXT_STALE_TIME_MS = 15 * 1000;
const CHAT_PROFILE_STALE_TIME_MS = 60 * 1000;
const CHAT_SESSIONS_STALE_TIME_MS = 30 * 1000;
const CHAT_MESSAGES_STALE_TIME_MS = 15 * 1000;

/**
 * 获取聊天会话查询配置。
 */
export function chatSessionsQueryOptions() {
  return queryOptions({
    queryKey: queryKeys.chat.sessions,
    queryFn: getChatSessions,
    staleTime: CHAT_SESSIONS_STALE_TIME_MS,
  });
}

/**
 * 获取当前聊天配置查询配置。
 */
export function chatProfileQueryOptions() {
  return queryOptions({
    queryKey: queryKeys.chat.profile,
    queryFn: getChatProfile,
    staleTime: CHAT_PROFILE_STALE_TIME_MS,
  });
}

/**
 * 获取聊天右栏 context 查询配置。
 */
export function chatContextQueryOptions(sessionId: number | null) {
  return queryOptions({
    queryKey: queryKeys.chat.context(sessionId),
    queryFn: sessionId === null ? skipToken : () => getChatSessionContext(sessionId),
    staleTime: CHAT_CONTEXT_STALE_TIME_MS,
  });
}

/**
 * 获取聊天消息查询配置。
 */
export function chatMessagesQueryOptions(sessionId: number | null) {
  return queryOptions({
    queryKey: queryKeys.chat.messages(sessionId),
    queryFn: sessionId === null ? skipToken : () => getChatMessages(sessionId),
    placeholderData: (previousData, previousQuery) =>
      previousQuery?.queryKey?.[2] === sessionId ? previousData : undefined,
    staleTime: CHAT_MESSAGES_STALE_TIME_MS,
  });
}
