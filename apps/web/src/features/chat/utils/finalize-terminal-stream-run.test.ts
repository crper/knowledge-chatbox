import type { InfiniteData } from "@tanstack/react-query";

import type { ChatMessageItem } from "@/features/chat/api/chat";
import { queryKeys } from "@/lib/api/query-keys";
import { createTestQueryClient } from "@/test/query-client";
import type { StreamingRun } from "../store/chat-stream-store";
import { finalizeTerminalStreamRun } from "./finalize-terminal-stream-run";

function buildMessage(overrides: Partial<ChatMessageItem>): ChatMessageItem {
  return {
    id: 1,
    role: "assistant",
    content: "",
    status: "succeeded",
    sources_json: [],
    ...overrides,
  };
}

function seedMessages(queryClient: ReturnType<typeof createTestQueryClient>, sessionId: number) {
  queryClient.setQueryData<InfiniteData<ChatMessageItem[], number | null>>(
    queryKeys.chat.messagesWindow(sessionId),
    {
      pageParams: [null],
      pages: [[]],
    },
  );
}

describe("finalizeTerminalStreamRun", () => {
  it("patches the retried user message back to succeeded and marks active-session runs for pruning", async () => {
    const queryClient = createTestQueryClient();
    const patchSessionContext = vi.fn();

    queryClient.setQueryData<InfiniteData<ChatMessageItem[], number | null>>(
      queryKeys.chat.messagesWindow(1),
      {
        pageParams: [null],
        pages: [
          [
            buildMessage({
              id: 7,
              role: "user",
              status: "failed",
              content: "retry me",
              error_message: "provider unavailable",
            }),
          ],
        ],
      },
    );

    const currentRun: StreamingRun = {
      runId: 11,
      sessionId: 1,
      assistantMessageId: 12,
      retryOfMessageId: 7,
      userMessageId: 8,
      userContent: "retry me",
      content: "fixed answer",
      sources: [],
      errorMessage: null,
      status: "succeeded",
      toastShown: false,
    };

    const result = await finalizeTerminalStreamRun({
      currentRun,
      currentSessionId: 1,
      errorMessage: null,
      patchSessionContext,
      queryClient,
      sessionId: 1,
      status: "succeeded",
    });

    expect(result).toMatchObject({
      patched: true,
      shouldPruneRun: true,
    });
    expect(
      queryClient.getQueryData<InfiniteData<ChatMessageItem[], number | null>>(
        queryKeys.chat.messagesWindow(1),
      )?.pages[0],
    ).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: 7,
          status: "succeeded",
          error_message: null,
        }),
        expect.objectContaining({
          id: 12,
          content: "fixed answer",
          role: "assistant",
        }),
      ]),
    );
    expect(patchSessionContext).toHaveBeenCalledWith({
      latestAssistantMessageId: 12,
      latestAssistantSources: [],
      sessionId: 1,
    });
  });

  it("invalidates the message window when the assistant patch misses", async () => {
    const queryClient = createTestQueryClient();
    const patchSessionContext = vi.fn();
    const invalidateQueriesSpy = vi.spyOn(queryClient, "invalidateQueries");

    seedMessages(queryClient, 2);

    const result = await finalizeTerminalStreamRun({
      currentRun: null,
      currentSessionId: 1,
      errorMessage: "broken",
      patchSessionContext,
      queryClient,
      sessionId: 2,
      status: "failed",
    });

    expect(result).toMatchObject({
      patched: false,
      shouldPruneRun: false,
    });
    expect(invalidateQueriesSpy).toHaveBeenCalledWith({
      queryKey: queryKeys.chat.messagesWindow(2),
    });
  });

  it("keeps successful background runs available after refresh", async () => {
    const queryClient = createTestQueryClient();
    const patchSessionContext = vi.fn();

    queryClient.setQueryData<InfiniteData<ChatMessageItem[], number | null>>(
      queryKeys.chat.messagesWindow(3),
      {
        pageParams: [null],
        pages: [
          [
            buildMessage({
              id: 31,
              role: "assistant",
              status: "pending",
              content: "",
            }),
          ],
        ],
      },
    );

    const currentRun: StreamingRun = {
      runId: 31,
      sessionId: 3,
      assistantMessageId: 31,
      retryOfMessageId: null,
      userMessageId: 30,
      userContent: "hello",
      content: "background answer",
      sources: [],
      errorMessage: null,
      status: "succeeded",
      toastShown: false,
    };

    const result = await finalizeTerminalStreamRun({
      currentRun,
      currentSessionId: 1,
      errorMessage: null,
      patchSessionContext,
      queryClient,
      sessionId: 3,
      status: "succeeded",
    });

    expect(result).toMatchObject({
      patched: true,
      shouldPruneRun: false,
    });
  });
});
