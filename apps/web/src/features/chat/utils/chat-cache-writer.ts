import type { InfiniteData, QueryClient } from "@tanstack/react-query";

import { queryKeys } from "@/lib/api/query-keys";
import type {
  ChatAttachmentItem,
  ChatMessageItem,
  ChatSessionContextItem,
  ChatSourceItem,
} from "../api/chat";
import { MessageRole, MessageStatus } from "../constants";
import { patchPagedChatMessagesCache } from "./patch-paged-chat-messages";

function buildContextAttachmentKey(attachment: ChatAttachmentItem) {
  if (typeof attachment.document_id === "number") {
    return `document:${attachment.document_id}`;
  }

  if (typeof attachment.document_revision_id === "number") {
    return `version:${attachment.document_revision_id}`;
  }

  return `attachment:${attachment.attachment_id}`;
}

/**
 * 统一封装聊天 Query cache 的写入口。
 *
 * @param queryClient - TanStack Query 客户端实例
 * @returns 包含所有缓存写入方法的对象
 */
export function createChatCacheWriter(queryClient: QueryClient) {
  const patchSessionContext = ({
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

        const nextAttachments = (() => {
          if (attachments == null) return current.attachments;
          const attachmentMap = new Map<string, ChatAttachmentItem>();
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
  };

  const patchUserMessageAttachments = ({
    attachments,
    sessionId,
    userMessageId,
  }: {
    attachments: ChatAttachmentItem[];
    sessionId: number;
    userMessageId: number;
  }) => {
    if (!attachments?.length) {
      return false;
    }

    let patched = false;

    queryClient.setQueryData<InfiniteData<ChatMessageItem[], number | null>>(
      queryKeys.chat.messagesWindow(sessionId),
      (current) => {
        if (!current || typeof current !== "object" || !("pages" in current)) {
          return current;
        }

        const nextPages = current.pages.map((page) =>
          page.map((message) => {
            if (message.id !== userMessageId || message.role !== MessageRole.USER) {
              return message;
            }

            patched = true;
            return {
              ...message,
              attachments: attachments,
            };
          }),
        );

        return patched ? { ...current, pages: nextPages } : current;
      },
    );

    return patched;
  };

  const appendStartedUserMessage = ({
    content,
    sessionId,
    userMessageId,
  }: {
    content: string;
    sessionId: number;
    userMessageId: number;
  }) => {
    queryClient.setQueryData<InfiniteData<ChatMessageItem[], number | null>>(
      queryKeys.chat.messagesWindow(sessionId),
      (current) => {
        if (!current || typeof current !== "object" || !("pages" in current)) {
          return current;
        }

        const lastPage = current.pages.at(-1) ?? [];
        const knownIds = new Set(lastPage.map((message: ChatMessageItem) => message.id));
        if (knownIds.has(userMessageId)) {
          return current;
        }

        const nextLastPage = [
          ...(current.pages.at(-1) ?? []),
          {
            content,
            id: userMessageId,
            role: MessageRole.USER,
            status: MessageStatus.SUCCEEDED,
            sources: [],
          } satisfies ChatMessageItem,
        ];

        return {
          ...current,
          pages: [...current.pages.slice(0, -1), nextLastPage],
        };
      },
    );
  };

  const patchAssistantMessage = ({
    appendIfMissing = [],
    assistantMessageId,
    patch,
    sessionId,
  }: {
    appendIfMissing?: ChatMessageItem[];
    assistantMessageId: number;
    patch: {
      content?: string;
      error_message?: string | null;
      sources?: ChatSourceItem[] | null;
      status?: MessageStatus;
    };
    sessionId: number;
  }) => {
    return patchPagedChatMessagesCache({
      appendIfMissing,
      assistantMessageId,
      patch,
      queryClient,
      sessionId,
    });
  };

  const patchRetriedUserMessage = ({
    sessionId,
    userMessageId,
  }: {
    sessionId: number;
    userMessageId: number;
  }) => {
    queryClient.setQueryData<InfiniteData<ChatMessageItem[], number | null>>(
      queryKeys.chat.messagesWindow(sessionId),
      (current) => {
        if (!current || typeof current !== "object" || !("pages" in current)) {
          return current;
        }

        let patched = false;
        const nextPages = current.pages.map((page) =>
          page.map((message) => {
            if (message.id !== userMessageId || message.role !== MessageRole.USER) {
              return message;
            }

            patched = true;
            return {
              ...message,
              error_message: null,
              status: MessageStatus.SUCCEEDED,
            } satisfies ChatMessageItem;
          }),
        );

        return patched ? { ...current, pages: nextPages } : current;
      },
    );
  };

  const invalidateSessionArtifacts = async (sessionId: number) => {
    await Promise.all([
      queryClient.invalidateQueries({
        queryKey: queryKeys.chat.messagesWindow(sessionId),
      }),
      queryClient.invalidateQueries({
        queryKey: queryKeys.chat.context(sessionId),
      }),
    ]);
  };

  return {
    appendStartedUserMessage,
    invalidateSessionArtifacts,
    patchAssistantMessage,
    patchRetriedUserMessage,
    patchSessionContext,
    patchUserMessageAttachments,
  };
}

export type ChatCacheWriter = ReturnType<typeof createChatCacheWriter>;
