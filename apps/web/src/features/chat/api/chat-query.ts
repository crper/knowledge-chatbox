/**
 * @file 聊天查询配置模块。
 */

import { infiniteQueryOptions, queryOptions, skipToken } from "@tanstack/react-query";

import { queryKeys } from "@/lib/api/query-keys";
import { fetchProtectedFile } from "@/lib/api/protected-file";
import {
  getChatMessagesWindow,
  getChatProfile,
  getChatSessionContext,
  getChatSessions,
} from "./chat";

const CHAT_CONTEXT_STALE_TIME_MS = 15 * 1000;
const CHAT_MESSAGES_WINDOW_SIZE = 80;
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
 * 获取分页聊天消息查询配置。
 */
export function chatMessagesWindowInfiniteQueryOptions(sessionId: number | null) {
  return infiniteQueryOptions({
    queryKey: queryKeys.chat.messagesWindow(sessionId),
    enabled: sessionId !== null,
    queryFn: ({ pageParam }: { pageParam: number | null }) => {
      if (sessionId === null) {
        return Promise.resolve([]);
      }

      return getChatMessagesWindow(sessionId, {
        beforeId: pageParam,
        limit: CHAT_MESSAGES_WINDOW_SIZE,
      });
    },
    initialPageParam: null as number | null,
    getNextPageParam: (lastPage) => {
      if (lastPage.length < CHAT_MESSAGES_WINDOW_SIZE) {
        return undefined;
      }

      return lastPage[0]?.id ?? undefined;
    },
    staleTime: CHAT_MESSAGES_STALE_TIME_MS,
  });
}

export function imageViewerRemoteQueryOptions(url: string | null | undefined, enabled: boolean) {
  return queryOptions({
    queryKey: queryKeys.chat.imageViewerRemote(url),
    queryFn: async () => {
      const blob = await (await fetchProtectedFile(url!)).blob();
      return URL.createObjectURL(blob);
    },
    enabled: enabled && url != null,
    staleTime: Infinity,
    gcTime: 0,
  });
}
