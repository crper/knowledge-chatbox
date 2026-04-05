import { useChatStreamStore } from "./chat-stream-store";

describe("chat stream store", () => {
  beforeEach(() => {
    useChatStreamStore.setState({ runsById: {} });
  });

  describe("startRun", () => {
    it("creates a new run with pending status and empty content", () => {
      const store = useChatStreamStore.getState();

      store.startRun({
        runId: 1,
        sessionId: 10,
        assistantMessageId: 11,
        userMessageId: 12,
        userContent: "hello",
      });

      const runs = useChatStreamStore.getState().runsById;
      expect(runs).toHaveProperty("1");
      expect(runs[1]).toMatchObject({
        runId: 1,
        sessionId: 10,
        assistantMessageId: 11,
        userMessageId: 12,
        userContent: "hello",
        content: "",
        sources: [],
        errorMessage: null,
        status: "pending",
        toastShown: false,
      });
    });

    it("supports retryOfMessageId option", () => {
      const store = useChatStreamStore.getState();

      store.startRun({
        runId: 2,
        sessionId: 10,
        assistantMessageId: 21,
        retryOfMessageId: 15,
        userMessageId: 14,
        userContent: "retry content",
      });

      expect(useChatStreamStore.getState().runsById[2]?.retryOfMessageId).toBe(15);
    });

    it("defaults retryOfMessageId to null when not provided", () => {
      const store = useChatStreamStore.getState();

      store.startRun({
        runId: 3,
        sessionId: 10,
        assistantMessageId: 31,
        userMessageId: 32,
        userContent: "test",
      });

      expect(useChatStreamStore.getState().runsById[3]?.retryOfMessageId).toBeNull();
    });
  });

  describe("appendDelta", () => {
    it("appends delta content and transitions status to streaming", () => {
      const store = useChatStreamStore.getState();

      store.startRun({
        runId: 1,
        sessionId: 10,
        assistantMessageId: 11,
        userMessageId: 12,
        userContent: "hello",
      });
      store.appendDelta(1, "Hello ");

      const run = useChatStreamStore.getState().runsById[1];
      expect(run?.content).toBe("Hello ");
      expect(run?.status).toBe("streaming");
    });

    it("accumulates multiple deltas", () => {
      const store = useChatStreamStore.getState();

      store.startRun({
        runId: 1,
        sessionId: 10,
        assistantMessageId: 11,
        userMessageId: 12,
        userContent: "hello",
      });
      store.appendDelta(1, "Hello ");
      store.appendDelta(1, "World ");
      store.appendDelta(1, "!");

      expect(useChatStreamStore.getState().runsById[1]?.content).toBe("Hello World !");
    });

    it("clears errorMessage on delta append", () => {
      const store = useChatStreamStore.getState();

      store.startRun({
        runId: 1,
        sessionId: 10,
        assistantMessageId: 11,
        userMessageId: 12,
        userContent: "hello",
      });
      store.failRun(1, "previous error");
      store.appendDelta(1, "recovered");

      const run = useChatStreamStore.getState().runsById[1];
      expect(run?.errorMessage).toBeNull();
      expect(run?.status).toBe("streaming");
    });

    it("does nothing if run does not exist", () => {
      const store = useChatStreamStore.getState();

      store.appendDelta(999, "delta");

      expect(useChatStreamStore.getState().runsById).toEqual({});
    });
  });

  describe("addSource", () => {
    it("adds a source to an existing run", () => {
      const store = useChatStreamStore.getState();
      const source = { chunk_id: "1:0", snippet: "test snippet" };

      store.startRun({
        runId: 1,
        sessionId: 10,
        assistantMessageId: 11,
        userMessageId: 12,
        userContent: "hello",
      });
      store.addSource(1, source);

      expect(useChatStreamStore.getState().runsById[1]?.sources).toHaveLength(1);
      expect(useChatStreamStore.getState().runsById[1]?.sources[0]).toEqual(source);
    });

    it("accumulates multiple sources", () => {
      const store = useChatStreamStore.getState();

      store.startRun({
        runId: 1,
        sessionId: 10,
        assistantMessageId: 11,
        userMessageId: 12,
        userContent: "hello",
      });
      store.addSource(1, { chunk_id: "1:0" });
      store.addSource(1, { chunk_id: "2:0" });
      store.addSource(1, { chunk_id: "3:0" });

      expect(useChatStreamStore.getState().runsById[1]?.sources).toHaveLength(3);
    });

    it("does nothing if run does not exist", () => {
      const store = useChatStreamStore.getState();

      store.addSource(999, { chunk_id: "1:0" });

      expect(useChatStreamStore.getState().runsById).toEqual({});
    });
  });

  describe("completeRun", () => {
    it("transitions run status to succeeded and clears error", () => {
      const store = useChatStreamStore.getState();

      store.startRun({
        runId: 1,
        sessionId: 10,
        assistantMessageId: 11,
        userMessageId: 12,
        userContent: "hello",
      });
      store.appendDelta(1, "done");
      store.completeRun(1);

      const run = useChatStreamStore.getState().runsById[1];
      expect(run?.status).toBe("succeeded");
      expect(run?.errorMessage).toBeNull();
      expect(run?.content).toBe("done");
    });

    it("does nothing if run does not exist", () => {
      const store = useChatStreamStore.getState();

      store.completeRun(999);

      expect(useChatStreamStore.getState().runsById).toEqual({});
    });
  });

  describe("failRun", () => {
    it("transitions run status to failed with error message", () => {
      const store = useChatStreamStore.getState();

      store.startRun({
        runId: 1,
        sessionId: 10,
        assistantMessageId: 11,
        userMessageId: 12,
        userContent: "hello",
      });
      store.failRun(1, "provider unavailable");

      const run = useChatStreamStore.getState().runsById[1];
      expect(run?.status).toBe("failed");
      expect(run?.errorMessage).toBe("provider unavailable");
    });

    it("defaults errorMessage to null", () => {
      const store = useChatStreamStore.getState();

      store.startRun({
        runId: 1,
        sessionId: 10,
        assistantMessageId: 11,
        userMessageId: 12,
        userContent: "hello",
      });
      store.failRun(1);

      expect(useChatStreamStore.getState().runsById[1]?.errorMessage).toBeNull();
      expect(useChatStreamStore.getState().runsById[1]?.status).toBe("failed");
    });

    it("preserves accumulated content on failure", () => {
      const store = useChatStreamStore.getState();

      store.startRun({
        runId: 1,
        sessionId: 10,
        assistantMessageId: 11,
        userMessageId: 12,
        userContent: "hello",
      });
      store.appendDelta(1, "partial ");
      store.failRun(1, "connection lost");

      const run = useChatStreamStore.getState().runsById[1];
      expect(run?.content).toBe("partial ");
      expect(run?.status).toBe("failed");
    });
  });

  describe("markToastShown", () => {
    it("marks toastShown as true for a run", () => {
      const store = useChatStreamStore.getState();

      store.startRun({
        runId: 1,
        sessionId: 10,
        assistantMessageId: 11,
        userMessageId: 12,
        userContent: "hello",
      });
      store.markToastShown(1);

      expect(useChatStreamStore.getState().runsById[1]?.toastShown).toBe(true);
    });

    it("does nothing if run does not exist", () => {
      const store = useChatStreamStore.getState();

      store.markToastShown(999);

      expect(useChatStreamStore.getState().runsById).toEqual({});
    });
  });

  describe("removeRun", () => {
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

    it("does nothing if run id does not exist", () => {
      const store = useChatStreamStore.getState();

      store.startRun({
        runId: 1,
        sessionId: 10,
        assistantMessageId: 11,
        userMessageId: 12,
        userContent: "hello",
      });
      store.removeRun(999);

      expect(useChatStreamStore.getState().runsById).toHaveProperty("1");
    });
  });

  describe("pruneRuns", () => {
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

    it("only removes specified runs, leaving others intact", () => {
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
      store.startRun({
        runId: 3,
        sessionId: 10,
        assistantMessageId: 31,
        userMessageId: 32,
        userContent: "third",
      });
      store.completeRun(1);
      store.pruneRuns([1]);

      const runs = useChatStreamStore.getState().runsById;
      expect(runs).not.toHaveProperty("1");
      expect(runs).toHaveProperty("2");
      expect(runs).toHaveProperty("3");
    });

    it("does nothing when given an empty list", () => {
      const store = useChatStreamStore.getState();

      store.startRun({
        runId: 1,
        sessionId: 10,
        assistantMessageId: 11,
        userMessageId: 12,
        userContent: "hello",
      });
      store.pruneRuns([]);

      expect(useChatStreamStore.getState().runsById).toHaveProperty("1");
    });
  });

  describe("lifecycle integration", () => {
    it("simulates a full successful streaming lifecycle", () => {
      const store = useChatStreamStore.getState();

      store.startRun({
        runId: 100,
        sessionId: 1,
        assistantMessageId: 101,
        userMessageId: 102,
        userContent: "what is AI?",
      });

      let run = useChatStreamStore.getState().runsById[100];
      expect(run?.status).toBe("pending");
      expect(run?.content).toBe("");

      store.appendDelta(100, "AI stands for ");
      run = useChatStreamStore.getState().runsById[100];
      expect(run?.status).toBe("streaming");
      expect(run?.content).toBe("AI stands for ");

      store.appendDelta(100, "Artificial Intelligence.");
      store.addSource(100, { chunk_id: "1:0", section_title: "Intro" });
      run = useChatStreamStore.getState().runsById[100];
      expect(run?.content).toBe("AI stands for Artificial Intelligence.");
      expect(run?.sources).toHaveLength(1);

      store.completeRun(100);
      run = useChatStreamStore.getState().runsById[100];
      expect(run?.status).toBe("succeeded");
      expect(run?.errorMessage).toBeNull();
    });

    it("simulates a failed streaming lifecycle with partial content", () => {
      const store = useChatStreamStore.getState();

      store.startRun({
        runId: 200,
        sessionId: 2,
        assistantMessageId: 201,
        userMessageId: 202,
        userContent: "tell me more",
      });

      store.appendDelta(200, "Here is some ");
      store.failRun(200, "connection timeout");

      const run = useChatStreamStore.getState().runsById[200];
      expect(run?.status).toBe("failed");
      expect(run?.errorMessage).toBe("connection timeout");
      expect(run?.content).toBe("Here is some ");
    });

    it("handles concurrent runs independently", () => {
      const store = useChatStreamStore.getState();

      store.startRun({
        runId: 1,
        sessionId: 1,
        assistantMessageId: 11,
        userMessageId: 12,
        userContent: "question 1",
      });
      store.startRun({
        runId: 2,
        sessionId: 2,
        assistantMessageId: 21,
        userMessageId: 22,
        userContent: "question 2",
      });

      store.appendDelta(1, "answer 1");
      store.completeRun(1);
      store.appendDelta(2, "answer 2 part ");
      store.appendDelta(2, "continued");
      store.failRun(2, "rate limited");

      const run1 = useChatStreamStore.getState().runsById[1];
      const run2 = useChatStreamStore.getState().runsById[2];

      expect(run1?.status).toBe("succeeded");
      expect(run1?.content).toBe("answer 1");
      expect(run2?.status).toBe("failed");
      expect(run2?.content).toBe("answer 2 part continued");
      expect(run2?.errorMessage).toBe("rate limited");
    });
  });
});
