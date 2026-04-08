/**
 * @file 聊天会话数据与 cache patch Hook 模块。
 */

import { useCallback, useMemo } from "react";
import { useInfiniteQuery, useQuery } from "@tanstack/react-query";

import {
  chatMessagesWindowInfiniteQueryOptions,
  chatSessionsQueryOptions,
} from "@/features/chat/api/chat-query";
import type { ChatSessionItem } from "../api/chat";
import { useChatRuntimeState } from "./use-chat-runtime-state";
import { buildDisplayMessages } from "../utils/build-display-messages";

export function useChatSessionData(activeSessionId: number | null) {
  const sessionsQuery = useQuery(chatSessionsQueryOptions());
  const sessions = Array.isArray(sessionsQuery.data) ? sessionsQuery.data : [];
  const resolvedActiveSessionId = useMemo(() => {
    if (activeSessionId === null || sessionsQuery.isPending) {
      return null;
    }

    return sessions.some((session) => session.id === activeSessionId) ? activeSessionId : null;
  }, [activeSessionId, sessions, sessionsQuery.isPending]);

  const messagesWindowQuery = useInfiniteQuery(
    chatMessagesWindowInfiniteQueryOptions(resolvedActiveSessionId),
  );

  const messages = useMemo(
    () => messagesWindowQuery.data?.pages.flatMap((page) => page) ?? [],
    [messagesWindowQuery.data],
  );

  const activeSession = useMemo(
    () =>
      sessions.find((session: ChatSessionItem) => session.id === resolvedActiveSessionId) ?? null,
    [resolvedActiveSessionId, sessions],
  );
  const { sessionRunsById: runsById } = useChatRuntimeState(resolvedActiveSessionId);

  const displayMessages = useMemo(() => {
    return buildDisplayMessages({
      activeSessionId: resolvedActiveSessionId,
      messages,
      runsById,
    });
  }, [resolvedActiveSessionId, messages, runsById]);

  const hasOlderMessages = messagesWindowQuery.hasNextPage ?? false;
  const isLoadingOlderMessages = messagesWindowQuery.isFetchingNextPage;
  const messagesWindowReady = resolvedActiveSessionId === null || !messagesWindowQuery.isPending;

  const loadOlderMessages = useCallback(async () => {
    if (!hasOlderMessages || isLoadingOlderMessages) {
      return;
    }

    await messagesWindowQuery.fetchNextPage();
  }, [hasOlderMessages, isLoadingOlderMessages, messagesWindowQuery]);

  return {
    activeSession,
    displayMessages,
    hasOlderMessages,
    isLoadingOlderMessages,
    loadOlderMessages,
    messages,
    messagesWindowQuery,
    messagesWindowReady,
    resolvedActiveSessionId,
    sessions,
    sessionsQuery,
  };
}
