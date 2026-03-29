import type { InfiniteData } from "@tanstack/react-query";

import type { ChatMessageItem } from "@/features/chat/api/chat";
import { queryKeys } from "@/lib/api/query-keys";
import { createTestQueryClient } from "@/test/query-client";
import { patchPagedChatMessagesCache } from "./patch-paged-chat-messages";

function buildAssistantMessage(
  id: number,
  overrides: Partial<ChatMessageItem> = {},
): ChatMessageItem {
  return {
    id,
    role: "assistant",
    content: `message ${id}`,
    status: "succeeded",
    error_message: null,
    sources_json: [],
    ...overrides,
  };
}

describe("patchPagedChatMessagesCache", () => {
  it("patches the matching assistant message across paged cache data", () => {
    const queryClient = createTestQueryClient();
    queryClient.setQueryData<InfiniteData<ChatMessageItem[], number | null>>(
      queryKeys.chat.messagesWindow(1),
      {
        pageParams: [null, 3],
        pages: [
          [buildAssistantMessage(1), buildAssistantMessage(2)],
          [buildAssistantMessage(3), buildAssistantMessage(4)],
        ],
      },
    );

    const patched = patchPagedChatMessagesCache({
      assistantMessageId: 4,
      patch: {
        content: "patched answer",
        status: "failed",
        error_message: "provider unavailable",
        sources_json: [{ chunk_id: "4:0", snippet: "patched snippet" }],
      },
      queryClient,
      sessionId: 1,
    });

    expect(patched).toBe(true);
    expect(
      queryClient.getQueryData<InfiniteData<ChatMessageItem[], number | null>>(
        queryKeys.chat.messagesWindow(1),
      )?.pages[1]?.[1],
    ).toMatchObject({
      content: "patched answer",
      status: "failed",
      error_message: "provider unavailable",
      sources_json: [{ chunk_id: "4:0", snippet: "patched snippet" }],
    });
  });

  it("returns false when the assistant message is missing from the paged cache", () => {
    const queryClient = createTestQueryClient();
    queryClient.setQueryData<InfiniteData<ChatMessageItem[], number | null>>(
      queryKeys.chat.messagesWindow(1),
      {
        pageParams: [null],
        pages: [[buildAssistantMessage(1), buildAssistantMessage(2)]],
      },
    );

    const patched = patchPagedChatMessagesCache({
      assistantMessageId: 999,
      patch: { content: "missing" },
      queryClient,
      sessionId: 1,
    });

    expect(patched).toBe(false);
  });

  it("appends streamed messages to the last page when the assistant is missing", () => {
    const queryClient = createTestQueryClient();
    queryClient.setQueryData<InfiniteData<ChatMessageItem[], number | null>>(
      queryKeys.chat.messagesWindow(1),
      {
        pageParams: [null],
        pages: [[buildAssistantMessage(1), buildAssistantMessage(2)]],
      },
    );

    const patched = patchPagedChatMessagesCache({
      appendIfMissing: [
        {
          content: "question",
          id: 3,
          role: "user",
          status: "succeeded",
          sources_json: [],
        },
        buildAssistantMessage(4, {
          content: "streamed answer",
          reply_to_message_id: 3,
          status: "succeeded",
        }),
      ],
      assistantMessageId: 4,
      patch: {
        content: "streamed answer",
        status: "succeeded",
      },
      queryClient,
      sessionId: 1,
    });

    expect(patched).toBe(true);
    expect(
      queryClient.getQueryData<InfiniteData<ChatMessageItem[], number | null>>(
        queryKeys.chat.messagesWindow(1),
      )?.pages[0],
    ).toMatchObject([
      { id: 1 },
      { id: 2 },
      { id: 3, role: "user", content: "question" },
      { id: 4, role: "assistant", content: "streamed answer" },
    ]);
  });
});
