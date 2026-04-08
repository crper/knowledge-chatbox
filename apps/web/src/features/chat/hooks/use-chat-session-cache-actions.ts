import { useCallback } from "react";
import { useQueryClient, type InfiniteData } from "@tanstack/react-query";

import { queryKeys } from "@/lib/api/query-keys";
import type {
  ChatAttachmentItem as PersistedChatAttachmentItem,
  ChatMessageItem,
  ChatSessionContextItem,
} from "../api/chat";

function buildContextAttachmentKey(attachment: PersistedChatAttachmentItem) {
  if (attachment.resource_document_id != null) {
    return `document:${attachment.resource_document_id}`;
  }

  if (attachment.resource_document_version_id != null) {
    return `version:${attachment.resource_document_version_id}`;
  }

  return `attachment:${attachment.attachment_id}`;
}

export function useChatSessionCacheActions() {
  const queryClient = useQueryClient();

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

  const appendStartedUserMessage = useCallback(
    ({
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

          const knownIds = new Set(
            current.pages.flatMap((page: ChatMessageItem[]) => page.map((message) => message.id)),
          );
          if (knownIds.has(userMessageId)) {
            return current;
          }

          const nextLastPage = [
            ...(current.pages.at(-1) ?? []),
            {
              content,
              id: userMessageId,
              role: "user",
              status: "succeeded",
              sources_json: [],
            } satisfies ChatMessageItem,
          ];

          return {
            ...current,
            pages: [...current.pages.slice(0, -1), nextLastPage],
          };
        },
      );
    },
    [queryClient],
  );

  const invalidateSessionArtifacts = useCallback(
    async (sessionId: number) => {
      await queryClient.invalidateQueries({
        queryKey: queryKeys.chat.messagesWindow(sessionId),
      });
      await queryClient.invalidateQueries({
        queryKey: queryKeys.chat.context(sessionId),
      });
    },
    [queryClient],
  );

  return {
    appendStartedUserMessage,
    invalidateSessionArtifacts,
    patchSessionContext,
    patchUserMessageAttachments,
  };
}
