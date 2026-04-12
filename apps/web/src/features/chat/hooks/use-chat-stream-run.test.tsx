import { act, render } from "@testing-library/react";
import { QueryClientProvider } from "@tanstack/react-query";

import { queryKeys } from "@/lib/api/query-keys";
import { createTestQueryClient } from "@/test/query-client";
import { useChatStreamRun } from "./use-chat-stream-run";
import type { StreamingRun } from "../utils/streaming-run";

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

  it("ignores late deltas and completion after a run is stopped", () => {
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
        runId: 21,
        sessionId: 1,
        assistantMessageId: 22,
        retryOfMessageId: null,
        userMessageId: 20,
        userContent: "question",
      });
      actions!.appendDelta(21, "partial");
      actions!.stopRun(21, "已停止生成");
      actions!.appendDelta(21, " late");
      actions!.completeRun(21);
      vi.advanceTimersByTime(16);
    });

    expect(queryClient.getQueryData(queryKeys.chat.streamRun(21))).toMatchObject({
      content: ["partial"],
      errorMessage: "已停止生成",
      status: "failed",
      suppressPersistedAssistantMessage: true,
      terminalState: "stopped",
    });
  });

  it("gracefully handles flushing deltas for non-existent runId", () => {
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
        runId: 30,
        sessionId: 1,
        assistantMessageId: 31,
        retryOfMessageId: null,
        userMessageId: 29,
        userContent: "question",
      });
    });

    expect(queryClient.getQueryData(queryKeys.chat.streamRun(30))).toMatchObject({
      runId: 30,
      status: "pending",
    });
  });

  it("preserves consecutive identical deltas from the provider", () => {
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
        runId: 40,
        sessionId: 1,
        assistantMessageId: 41,
        retryOfMessageId: null,
        userMessageId: 39,
        userContent: "question",
      });
      actions!.appendDelta(40, "hello");
    });

    act(() => {
      vi.advanceTimersByTime(16);
    });

    expect(queryClient.getQueryData(queryKeys.chat.streamRun(40))).toMatchObject({
      content: ["hello"],
      status: "streaming",
    });

    act(() => {
      actions!.appendDelta(40, "hello");
      vi.advanceTimersByTime(16);
    });

    expect(queryClient.getQueryData(queryKeys.chat.streamRun(40))).toMatchObject({
      content: ["hello", "hello"],
      status: "streaming",
    });
  });

  it("skips duplicate source based on chunk_id", () => {
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
        runId: 50,
        sessionId: 1,
        assistantMessageId: 51,
        retryOfMessageId: null,
        userMessageId: 49,
        userContent: "question",
      });
      actions!.addSource(50, {
        chunk_id: "doc-1:0",
        document_id: 1,
        document_revision_id: 1,
        document_name: "test.pdf",
        score: 0.9,
        snippet: "source content",
      });
      actions!.addSource(50, {
        chunk_id: "doc-1:0",
        document_id: 1,
        document_revision_id: 1,
        document_name: "test.pdf",
        score: 0.9,
        snippet: "source content",
      });
      actions!.addSource(50, {
        chunk_id: "doc-1:1",
        document_id: 1,
        document_revision_id: 1,
        document_name: "test.pdf",
        score: 0.8,
        snippet: "other content",
      });
    });

    const runData = queryClient.getQueryData(queryKeys.chat.streamRun(50));
    expect((runData as StreamingRun)?.sources).toHaveLength(2);
    expect((runData as StreamingRun)?.sources.map((s) => s.chunk_id)).toEqual([
      "doc-1:0",
      "doc-1:1",
    ]);
  });

  it("skips startRun when existing run status is not PENDING", () => {
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
        runId: 60,
        sessionId: 1,
        assistantMessageId: 61,
        retryOfMessageId: null,
        userMessageId: 59,
        userContent: "question",
      });
      actions!.appendDelta(60, "partial");
    });

    act(() => {
      vi.advanceTimersByTime(16);
    });

    expect(queryClient.getQueryData(queryKeys.chat.streamRun(60))).toMatchObject({
      content: ["partial"],
      status: "streaming",
    });

    act(() => {
      actions!.startRun({
        runId: 60,
        sessionId: 2,
        assistantMessageId: 62,
        retryOfMessageId: null,
        userMessageId: 60,
        userContent: "new question",
      });
    });

    expect(queryClient.getQueryData(queryKeys.chat.streamRun(60))).toMatchObject({
      runId: 60,
      content: ["partial"],
      status: "streaming",
    });
  });
});
