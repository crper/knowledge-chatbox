import type { StreamingRun } from "../utils/streaming-run";
import { pickStopTargetRun } from "./use-chat-workspace";

describe("pickStopTargetRun", () => {
  it("prefers the runtime controller snapshot over stale session run state", () => {
    const activeRun: StreamingRun = {
      runId: 15,
      sessionId: 1,
      assistantMessageId: 14,
      retryOfMessageId: null,
      userMessageId: 13,
      userContent: "hello",
      content: [] as string[],
      sources: [],
      errorMessage: null,
      status: "streaming" as const,
      suppressPersistedAssistantMessage: false,
      terminalState: null,
      toastShown: false,
    };

    const result = pickStopTargetRun({
      resolvedActiveSessionId: 1,
      sessionRunsById: {},
      streamRun: {
        getAllRunsForSession: () => [activeRun],
      },
    });

    expect(result).toMatchObject({
      runId: 15,
      status: "streaming",
    });
  });

  it("falls back to the latest active session run when the runtime snapshot is empty", () => {
    const result = pickStopTargetRun({
      resolvedActiveSessionId: 1,
      sessionRunsById: {
        15: {
          runId: 15,
          sessionId: 1,
          assistantMessageId: 14,
          retryOfMessageId: null,
          userMessageId: 13,
          userContent: "older",
          content: [],
          sources: [],
          errorMessage: null,
          status: "pending",
          suppressPersistedAssistantMessage: false,
          terminalState: null,
          toastShown: false,
        },
        16: {
          runId: 16,
          sessionId: 1,
          assistantMessageId: 17,
          retryOfMessageId: null,
          userMessageId: 18,
          userContent: "newer",
          content: [],
          sources: [],
          errorMessage: null,
          status: "streaming",
          suppressPersistedAssistantMessage: false,
          terminalState: null,
          toastShown: false,
        },
      },
      streamRun: {
        getAllRunsForSession: () => [],
      },
    });

    expect(result).toMatchObject({
      runId: 16,
      status: "streaming",
    });
  });
});
