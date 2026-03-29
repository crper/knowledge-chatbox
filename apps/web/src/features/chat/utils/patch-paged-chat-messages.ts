import type { InfiniteData, QueryClient } from "@tanstack/react-query";

import type { ChatMessageItem, ChatSourceItem } from "@/features/chat/api/chat";
import { queryKeys } from "@/lib/api/query-keys";

type PatchPagedChatMessagesCacheInput = {
  appendIfMissing?: ChatMessageItem[];
  assistantMessageId: number;
  patch: {
    content?: string;
    error_message?: string | null;
    sources_json?: ChatSourceItem[] | null;
    status?: string;
  };
  queryClient: QueryClient;
  sessionId: number;
};

export function patchPagedChatMessagesCache({
  appendIfMissing = [],
  assistantMessageId,
  patch,
  queryClient,
  sessionId,
}: PatchPagedChatMessagesCacheInput) {
  let patched = false;

  queryClient.setQueryData<InfiniteData<ChatMessageItem[], number | null>>(
    queryKeys.chat.messagesWindow(sessionId),
    (current) => {
      if (!current) {
        return current;
      }

      const nextPages = current.pages.map((page) =>
        page.map((message) => {
          if (message.id !== assistantMessageId || message.role !== "assistant") {
            return message;
          }

          patched = true;
          return {
            ...message,
            ...patch,
          };
        }),
      );

      if (patched) {
        return { ...current, pages: nextPages };
      }

      if (appendIfMissing.length === 0) {
        return current;
      }

      const nextLastPage = [...(nextPages.at(-1) ?? [])];
      const knownIds = new Set(nextPages.flatMap((page) => page.map((message) => message.id)));
      for (const message of appendIfMissing) {
        if (knownIds.has(message.id)) {
          continue;
        }
        nextLastPage.push(message);
      }

      if (nextLastPage.length === (nextPages.at(-1) ?? []).length) {
        return current;
      }

      patched = true;
      return {
        ...current,
        pages: [...nextPages.slice(0, -1), nextLastPage],
      };
    },
  );

  return patched;
}
