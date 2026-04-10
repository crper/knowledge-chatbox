import { act, render } from "@testing-library/react";
import { QueryClientProvider } from "@tanstack/react-query";

import { queryKeys } from "@/lib/api/query-keys";
import { createTestQueryClient } from "@/test/query-client";
import { useChatStreamRun } from "./use-chat-stream-run";

function StreamRunHost({
  onReady,
}: {
  onReady: (actions: ReturnType<typeof useChatStreamRun>) => void;
}) {
  const actions = useChatStreamRun();
  onReady(actions);
  return null;
}

describe("useChatStreamRun", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("buffers streaming deltas and flushes them in batches", () => {
    const queryClient = createTestQueryClient();
    let actions: ReturnType<typeof useChatStreamRun> | null = null;

    render(
      <QueryClientProvider client={queryClient}>
        <StreamRunHost
          onReady={(value) => {
            actions = value;
          }}
        />
      </QueryClientProvider>,
    );

    act(() => {
      actions!.startRun({
        runId: 1,
        sessionId: 1,
        assistantMessageId: 2,
        retryOfMessageId: null,
        userMessageId: 3,
        userContent: "question",
      });
      actions!.appendDelta(1, "hello ");
      actions!.appendDelta(1, "world");
    });

    expect(queryClient.getQueryData(queryKeys.chat.streamRun(1))).toMatchObject({
      content: [],
      status: "pending",
    });

    act(() => {
      vi.advanceTimersByTime(16);
    });

    expect(queryClient.getQueryData(queryKeys.chat.streamRun(1))).toMatchObject({
      content: ["hello world"],
      status: "streaming",
    });
  });

  it("flushes pending deltas before marking run as completed", () => {
    const queryClient = createTestQueryClient();
    let actions: ReturnType<typeof useChatStreamRun> | null = null;

    render(
      <QueryClientProvider client={queryClient}>
        <StreamRunHost
          onReady={(value) => {
            actions = value;
          }}
        />
      </QueryClientProvider>,
    );

    act(() => {
      actions!.startRun({
        runId: 9,
        sessionId: 1,
        assistantMessageId: 12,
        retryOfMessageId: null,
        userMessageId: 11,
        userContent: "question",
      });
      actions!.appendDelta(9, "partial");
      actions!.appendDelta(9, " answer");
      actions!.completeRun(9);
    });

    expect(queryClient.getQueryData(queryKeys.chat.streamRun(9))).toMatchObject({
      content: ["partial answer"],
      status: "succeeded",
    });
  });

  it("migrates legacy string content to chunks when flushing deltas", () => {
    const queryClient = createTestQueryClient();
    let actions: ReturnType<typeof useChatStreamRun> | null = null;

    render(
      <QueryClientProvider client={queryClient}>
        <StreamRunHost
          onReady={(value) => {
            actions = value;
          }}
        />
      </QueryClientProvider>,
    );

    queryClient.setQueryData(queryKeys.chat.streamRun(7), {
      runId: 7,
      sessionId: 1,
      assistantMessageId: 8,
      retryOfMessageId: null,
      userMessageId: 6,
      userContent: "question",
      content: "legacy",
      sources: [],
      errorMessage: null,
      status: "streaming",
      toastShown: false,
    });

    act(() => {
      actions!.appendDelta(7, "-delta");
      vi.advanceTimersByTime(16);
    });

    expect(queryClient.getQueryData(queryKeys.chat.streamRun(7))).toMatchObject({
      content: ["legacy", "-delta"],
      status: "streaming",
    });
  });
});
