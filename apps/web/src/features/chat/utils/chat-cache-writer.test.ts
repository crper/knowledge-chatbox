import type { InfiniteData } from "@tanstack/react-query";

import type { ChatMessageItem, ChatSessionContextItem } from "../api/chat";
import { queryKeys } from "@/lib/api/query-keys";
import { createTestQueryClient } from "@/test/query-client";
import { createChatCacheWriter } from "./chat-cache-writer";

describe("createChatCacheWriter", () => {
  it("patches session context without replacing unrelated fields", () => {
    const queryClient = createTestQueryClient();
    const cacheWriter = createChatCacheWriter(queryClient);

    queryClient.setQueryData<ChatSessionContextItem | null>(queryKeys.chat.context(7), {
      session_id: 7,
      attachment_count: 0,
      attachments: [],
      latest_assistant_message_id: null,
      latest_assistant_sources: [],
    });

    cacheWriter.patchSessionContext({
      sessionId: 7,
      latestAssistantMessageId: 12,
      latestAssistantSources: [],
      attachments: [
        {
          attachment_id: "att-1",
          type: "document",
          name: "notes.md",
          mime_type: "text/markdown",
          size_bytes: 12,
          document_id: 88,
        },
      ],
    });

    expect(
      queryClient.getQueryData<ChatSessionContextItem | null>(queryKeys.chat.context(7)),
    ).toEqual(
      expect.objectContaining({
        session_id: 7,
        attachment_count: 1,
        latest_assistant_message_id: 12,
        attachments: [
          expect.objectContaining({
            attachment_id: "att-1",
            document_id: 88,
          }),
        ],
      }),
    );
  });

  it("appends a started user message once and skips duplicates", () => {
    const queryClient = createTestQueryClient();
    const cacheWriter = createChatCacheWriter(queryClient);

    queryClient.setQueryData<InfiniteData<ChatMessageItem[], number | null>>(
      queryKeys.chat.messagesWindow(7),
      {
        pageParams: [null],
        pages: [[]],
      },
    );

    cacheWriter.appendStartedUserMessage({
      sessionId: 7,
      userMessageId: 9,
      content: "queued hello",
    });
    cacheWriter.appendStartedUserMessage({
      sessionId: 7,
      userMessageId: 9,
      content: "queued hello",
    });

    expect(
      queryClient.getQueryData<InfiniteData<ChatMessageItem[], number | null>>(
        queryKeys.chat.messagesWindow(7),
      )?.pages[0],
    ).toEqual([
      expect.objectContaining({
        id: 9,
        role: "user",
        content: "queued hello",
      }),
    ]);
  });
});
