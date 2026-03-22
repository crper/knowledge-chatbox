import { useChatStreamStore } from "./chat-stream-store";

describe("chat stream store", () => {
  beforeEach(() => {
    useChatStreamStore.setState({ runsById: {} });
  });

  it("removes one run directly", () => {
    const store = useChatStreamStore.getState();

    store.startRun({
      runId: 1,
      sessionId: 10,
      assistantMessageId: 11,
      userMessageId: 12,
      userContent: "hello",
    });

    useChatStreamStore.getState().removeRun(1);

    expect(useChatStreamStore.getState().runsById).toEqual({});
  });

  it("prunes multiple terminal runs in one call", () => {
    const store = useChatStreamStore.getState();

    store.startRun({
      runId: 1,
      sessionId: 10,
      assistantMessageId: 11,
      userMessageId: 12,
      userContent: "first",
    });
    store.startRun({
      runId: 2,
      sessionId: 10,
      assistantMessageId: 21,
      userMessageId: 22,
      userContent: "second",
    });
    store.completeRun(1);
    store.failRun(2, "failed");

    useChatStreamStore.getState().pruneRuns([1, 2]);

    expect(useChatStreamStore.getState().runsById).toEqual({});
  });
});
