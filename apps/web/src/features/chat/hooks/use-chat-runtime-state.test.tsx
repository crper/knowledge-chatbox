import { render, screen, waitFor } from "@testing-library/react";
import { QueryClientProvider } from "@tanstack/react-query";

import { queryKeys } from "@/lib/api/query-keys";
import { createTestQueryClient } from "@/test/query-client";
import { useChatRuntimeState } from "./use-chat-runtime-state";

function RuntimeStateHost({ sessionId }: { sessionId: number | null }) {
  const state = useChatRuntimeState(sessionId);
  const firstRunContent = state.allRuns[0]?.content ?? [];

  return (
    <div>
      <div data-testid="session-run-ids">{Object.keys(state.sessionRunsById).join(",")}</div>
      <div data-testid="all-run-ids">{state.allRuns.map((run) => run.runId).join(",")}</div>
      <div data-testid="first-run-content">{firstRunContent.join("|")}</div>
    </div>
  );
}

describe("useChatRuntimeState", () => {
  it("returns session-scoped runs while keeping all runs available", async () => {
    const queryClient = createTestQueryClient();

    render(
      <QueryClientProvider client={queryClient}>
        <RuntimeStateHost sessionId={2} />
      </QueryClientProvider>,
    );

    queryClient.setQueryData(queryKeys.chat.streamRun(101), {
      runId: 101,
      sessionId: 2,
      assistantMessageId: 31,
      userMessageId: 30,
      userContent: "session two",
      content: "done",
      sources: [],
      errorMessage: null,
      status: "streaming",
      toastShown: false,
    });
    queryClient.setQueryData(queryKeys.chat.streamRun(202), {
      runId: 202,
      sessionId: 3,
      assistantMessageId: 41,
      userMessageId: 40,
      userContent: "session three",
      content: "done",
      sources: [],
      errorMessage: null,
      status: "succeeded",
      toastShown: false,
    });

    await waitFor(() => {
      expect(screen.getByTestId("session-run-ids")).toHaveTextContent("101");
      expect(screen.getByTestId("all-run-ids")).toHaveTextContent("101,202");
    });
  });

  it("drops session-scoped runs when the active session changes", async () => {
    const queryClient = createTestQueryClient();

    const { rerender } = render(
      <QueryClientProvider client={queryClient}>
        <RuntimeStateHost sessionId={2} />
      </QueryClientProvider>,
    );

    queryClient.setQueryData(queryKeys.chat.streamRun(101), {
      runId: 101,
      sessionId: 2,
      assistantMessageId: 31,
      userMessageId: 30,
      userContent: "session two",
      content: "done",
      sources: [],
      errorMessage: null,
      status: "streaming",
      toastShown: false,
    });
    queryClient.setQueryData(queryKeys.chat.streamRun(202), {
      runId: 202,
      sessionId: 3,
      assistantMessageId: 41,
      userMessageId: 40,
      userContent: "session three",
      content: "done",
      sources: [],
      errorMessage: null,
      status: "succeeded",
      toastShown: false,
    });

    await waitFor(() => {
      expect(screen.getByTestId("session-run-ids")).toHaveTextContent("101");
    });

    rerender(
      <QueryClientProvider client={queryClient}>
        <RuntimeStateHost sessionId={3} />
      </QueryClientProvider>,
    );

    await waitFor(() => {
      expect(screen.getByTestId("session-run-ids")).toHaveTextContent("202");
      expect(screen.getByTestId("all-run-ids")).toHaveTextContent("101,202");
    });
  });

  it("normalizes legacy string run content to chunk arrays", async () => {
    const queryClient = createTestQueryClient();

    render(
      <QueryClientProvider client={queryClient}>
        <RuntimeStateHost sessionId={2} />
      </QueryClientProvider>,
    );

    queryClient.setQueryData(queryKeys.chat.streamRun(101), {
      runId: 101,
      sessionId: 2,
      assistantMessageId: 31,
      userMessageId: 30,
      userContent: "session two",
      content: "legacy",
      sources: [],
      errorMessage: null,
      status: "streaming",
      toastShown: false,
    });

    await waitFor(() => {
      expect(screen.getByTestId("first-run-content")).toHaveTextContent("legacy");
    });
  });

  it("removes run state when streamRun query is deleted", async () => {
    const queryClient = createTestQueryClient();

    render(
      <QueryClientProvider client={queryClient}>
        <RuntimeStateHost sessionId={2} />
      </QueryClientProvider>,
    );

    queryClient.setQueryData(queryKeys.chat.streamRun(101), {
      runId: 101,
      sessionId: 2,
      assistantMessageId: 31,
      userMessageId: 30,
      userContent: "session two",
      content: "done",
      sources: [],
      errorMessage: null,
      status: "streaming",
      toastShown: false,
    });
    queryClient.setQueryData(queryKeys.chat.streamRun(202), {
      runId: 202,
      sessionId: 2,
      assistantMessageId: 41,
      userMessageId: 40,
      userContent: "session two",
      content: "done",
      sources: [],
      errorMessage: null,
      status: "succeeded",
      toastShown: false,
    });

    await waitFor(() => {
      expect(screen.getByTestId("all-run-ids")).toHaveTextContent("101,202");
    });

    queryClient.removeQueries({ queryKey: queryKeys.chat.streamRun(101) });

    await waitFor(() => {
      expect(screen.getByTestId("session-run-ids")).toHaveTextContent("202");
      expect(screen.getByTestId("all-run-ids")).toHaveTextContent("202");
    });
  });
});
