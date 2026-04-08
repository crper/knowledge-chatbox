import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClientProvider } from "@tanstack/react-query";

import { CHAT_STREAM_EVENT } from "../api/chat-stream-events";
import { createTestQueryClient } from "@/test/query-client";
import { useChatStreamLifecycle } from "./use-chat-stream-lifecycle";

const startChatStreamSpy = vi.fn(async ({ onEvent }: { onEvent: (event: any) => void }) => {
  onEvent({
    event: CHAT_STREAM_EVENT.runStarted,
    data: {
      run_id: 15,
      session_id: 7,
      user_message_id: 13,
      assistant_message_id: 14,
    },
  });

  onEvent({
    event: CHAT_STREAM_EVENT.runCompleted,
    data: {
      run_id: 15,
      session_id: 7,
      assistant_message_id: 14,
    },
  });

  return { userMessageId: 13 };
});

const appendStartedUserMessageSpy = vi.fn();
const streamRunMock = {
  addSource: vi.fn(),
  appendDelta: vi.fn(),
  completeRun: vi.fn(),
  failRun: vi.fn(),
  getRun: vi.fn(() => ({
    runId: 15,
    sessionId: 7,
    assistantMessageId: 14,
    userMessageId: 13,
    retryOfMessageId: null,
    userContent: "hello",
    content: "",
    sources: [],
    errorMessage: null,
    status: "pending",
    toastShown: false,
  })),
  pruneRuns: vi.fn(),
  startRun: vi.fn(),
};

vi.mock("../api/chat-stream", () => ({
  startChatStream: (input: { onEvent: (event: any) => void }) => startChatStreamSpy(input),
}));

vi.mock("../utils/finalize-terminal-stream-run", () => ({
  finalizeTerminalStreamRun: vi.fn(async () => ({
    patched: true,
    runId: 15,
    shouldPruneRun: true,
  })),
}));

function StreamLifecycleHost() {
  const { sendMutation } = useChatStreamLifecycle({
    currentSessionIdRef: { current: 7 },
    patchSessionContext: vi.fn(),
    appendStartedUserMessage: appendStartedUserMessageSpy,
    streamRun: streamRunMock as any,
  });

  return (
    <button
      onClick={() =>
        void sendMutation.mutateAsync({
          sessionId: 7,
          content: "hello",
        })
      }
      type="button"
    >
      send
    </button>
  );
}

describe("useChatStreamLifecycle", () => {
  beforeEach(() => {
    startChatStreamSpy.mockClear();
    appendStartedUserMessageSpy.mockClear();
    streamRunMock.addSource.mockClear();
    streamRunMock.appendDelta.mockClear();
    streamRunMock.completeRun.mockClear();
    streamRunMock.failRun.mockClear();
    streamRunMock.getRun.mockClear();
    streamRunMock.pruneRuns.mockClear();
    streamRunMock.startRun.mockClear();
  });

  it("uses the injected appendStartedUserMessage dependency when a run starts", async () => {
    const queryClient = createTestQueryClient();

    render(
      <QueryClientProvider client={queryClient}>
        <StreamLifecycleHost />
      </QueryClientProvider>,
    );

    fireEvent.click(screen.getByRole("button", { name: "send" }));

    await waitFor(() => {
      expect(appendStartedUserMessageSpy).toHaveBeenCalledWith({
        content: "hello",
        sessionId: 7,
        userMessageId: 13,
      });
    });
  });
});
