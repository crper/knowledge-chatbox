import { queryKeys } from "@/lib/api/query-keys";
import { createTestQueryClient } from "@/test/query-client";
import {
  findStreamRunByAssistantMessageId,
  getStreamRunsBySession,
  subscribeToStreamRunChanges,
} from "./stream-run-query";

describe("stream-run-query", () => {
  it("collects runs for a single session keyed by run id", () => {
    const queryClient = createTestQueryClient();
    queryClient.setQueryData(queryKeys.chat.streamRun(11), {
      runId: 11,
      sessionId: 1,
      assistantMessageId: 101,
      userMessageId: 100,
      userContent: "one",
      retryOfMessageId: null,
      content: "",
      sources: [],
      errorMessage: null,
      status: "streaming",
      toastShown: false,
    });
    queryClient.setQueryData(queryKeys.chat.streamRun(12), {
      runId: 12,
      sessionId: 2,
      assistantMessageId: 201,
      userMessageId: 200,
      userContent: "two",
      retryOfMessageId: null,
      content: "",
      sources: [],
      errorMessage: null,
      status: "succeeded",
      toastShown: false,
    });

    expect(getStreamRunsBySession(queryClient, 1)).toMatchObject({
      11: {
        runId: 11,
        sessionId: 1,
        assistantMessageId: 101,
      },
    });
  });

  it("finds a run by assistant message id within the active session", () => {
    const queryClient = createTestQueryClient();
    queryClient.setQueryData(queryKeys.chat.streamRun(11), {
      runId: 11,
      sessionId: 1,
      assistantMessageId: 101,
      userMessageId: 100,
      userContent: "one",
      retryOfMessageId: null,
      content: "",
      sources: [],
      errorMessage: null,
      status: "streaming",
      toastShown: false,
    });
    queryClient.setQueryData(queryKeys.chat.streamRun(12), {
      runId: 12,
      sessionId: 2,
      assistantMessageId: 101,
      userMessageId: 200,
      userContent: "two",
      retryOfMessageId: null,
      content: "",
      sources: [],
      errorMessage: null,
      status: "succeeded",
      toastShown: false,
    });

    expect(findStreamRunByAssistantMessageId(queryClient, 101, 1)).toMatchObject({
      runId: 11,
      sessionId: 1,
      userContent: "one",
    });
  });

  it("notifies only when streamRun queries change", () => {
    const queryClient = createTestQueryClient();
    const onChange = vi.fn();
    const unsubscribe = subscribeToStreamRunChanges(queryClient, onChange);

    queryClient.setQueryData(queryKeys.chat.sessions, []);
    expect(onChange).not.toHaveBeenCalled();

    queryClient.setQueryData(queryKeys.chat.streamRun(11), {
      runId: 11,
      sessionId: 1,
      assistantMessageId: 101,
      userMessageId: 100,
      userContent: "one",
      retryOfMessageId: null,
      content: "",
      sources: [],
      errorMessage: null,
      status: "streaming",
      toastShown: false,
    });
    expect(onChange).toHaveBeenCalled();

    unsubscribe();
  });
});
