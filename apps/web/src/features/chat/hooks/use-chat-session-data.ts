/**
 * @file 聊天会话数据与 cache patch Hook 模块。
 */

import { useCallback, useMemo } from "react";
import {
  useInfiniteQuery,
  useQuery,
  useQueryClient,
  type InfiniteData,
} from "@tanstack/react-query";

import {
  chatMessagesWindowInfiniteQueryOptions,
  chatSessionsQueryOptions,
} from "@/features/chat/api/chat-query";
import { queryKeys } from "@/lib/api/query-keys";
import type {
  ChatAttachmentItem as PersistedChatAttachmentItem,
  ChatMessageItem,
  ChatSessionContextItem,
  ChatSessionItem,
} from "../api/chat";
import { buildDisplayMessages } from "../utils/build-display-messages";
import type { StreamingRun } from "../store/chat-stream-store";

type ChatRunsById = Record<number, StreamingRun>;

function buildContextAttachmentKey(attachment: PersistedChatAttachmentItem) {
  if (attachment.resource_document_id != null) {
    return `document:${attachment.resource_document_id}`;
  }

  if (attachment.resource_document_version_id != null) {
    return `version:${attachment.resource_document_version_id}`;
  }

  return `attachment:${attachment.attachment_id}`;
}

export function useChatSessionData(activeSessionId: number | null, runsById: ChatRunsById) {
  const queryClient = useQueryClient();

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

  const patchSessionContext = useCallback(
    ({
      attachments,
      latestAssistantMessageId,
      latestAssistantSources,
      sessionId,
    }: {
      attachments?: ChatSessionContextItem["attachments"];
      latestAssistantMessageId?: number;
      latestAssistantSources?: ChatSessionContextItem["latest_assistant_sources"];
      sessionId: number;
    }) => {
      let patched = false;

      queryClient.setQueryData<ChatSessionContextItem | null>(
        queryKeys.chat.context(sessionId),
        (current) => {
          if (!current) {
            return current;
          }

          patched = true;
          const nextAttachments =
            attachments == null
              ? current.attachments
              : (() => {
                  const attachmentMap = new Map<string, PersistedChatAttachmentItem>();
                  for (const attachment of current.attachments ?? []) {
                    attachmentMap.set(buildContextAttachmentKey(attachment), attachment);
                  }
                  for (const attachment of attachments) {
                    attachmentMap.set(buildContextAttachmentKey(attachment), attachment);
                  }
                  return Array.from(attachmentMap.values());
                })();

          return {
            ...current,
            attachment_count: nextAttachments?.length ?? 0,
            attachments: nextAttachments,
            latest_assistant_message_id:
              latestAssistantMessageId ?? current.latest_assistant_message_id,
            latest_assistant_sources: latestAssistantSources ?? current.latest_assistant_sources,
          };
        },
      );

      if (!patched) {
        void queryClient.invalidateQueries({ queryKey: queryKeys.chat.context(sessionId) });
      }
    },
    [queryClient],
  );

  const patchUserMessageAttachments = useCallback(
    ({
      attachments,
      sessionId,
      userMessageId,
    }: {
      attachments: PersistedChatAttachmentItem[];
      sessionId: number;
      userMessageId: number;
    }) => {
      let patched = false;

      queryClient.setQueryData<InfiniteData<ChatMessageItem[], number | null>>(
        queryKeys.chat.messagesWindow(sessionId),
        (current) => {
          if (!current || typeof current !== "object" || !("pages" in current)) {
            return current;
          }

          const nextPages = current.pages.map((page) =>
            page.map((message) => {
              if (message.id !== userMessageId || message.role !== "user") {
                return message;
              }

              patched = true;
              return {
                ...message,
                attachments_json: attachments,
              };
            }),
          );

          return patched ? { ...current, pages: nextPages } : current;
        },
      );

      return patched;
    },
    [queryClient],
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

  const displayMessages = useMemo(
    () =>
      buildDisplayMessages({
        activeSessionId: resolvedActiveSessionId,
        messages,
        runsById,
      }),
    [resolvedActiveSessionId, messages, runsById],
  );

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
    patchSessionContext,
    patchUserMessageAttachments,
    resolvedActiveSessionId,
    sessions,
    sessionsQuery,
  };
}
