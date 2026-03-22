import { buildDisplayMessages } from "./build-display-messages";
import type { ChatMessageItem } from "../api/chat";

describe("buildDisplayMessages", () => {
  it("merges streaming assistant content into an existing message", () => {
    const messages: ChatMessageItem[] = [
      {
        id: 1,
        role: "user",
        content: "hello",
        status: "succeeded",
        sources_json: null,
      },
      {
        id: 2,
        role: "assistant",
        content: "draft",
        status: "pending",
        sources_json: [],
      },
    ];

    const result = buildDisplayMessages({
      activeSessionId: 1,
      messages,
      runsById: {
        9: {
          assistantMessageId: 2,
          content: "streamed answer",
          errorMessage: null,
          runId: 9,
          sessionId: 1,
          userMessageId: 1,
          userContent: "hello",
          status: "streaming",
          toastShown: false,
        },
      },
    });

    expect(result).toEqual([
      messages[0],
      {
        ...messages[1],
        content: "streamed answer",
        reply_to_message_id: 1,
        status: "streaming",
      },
    ]);
  });

  it("appends a temporary assistant message when the stream has no persisted message yet", () => {
    const messages: ChatMessageItem[] = [
      {
        id: 1,
        role: "user",
        content: "hello",
        status: "succeeded",
        sources_json: null,
      },
    ];

    const result = buildDisplayMessages({
      activeSessionId: 1,
      messages,
      runsById: {
        10: {
          assistantMessageId: 3,
          content: "answer",
          errorMessage: null,
          runId: 10,
          sessionId: 1,
          userMessageId: 1,
          userContent: "hello",
          status: "succeeded",
          toastShown: false,
        },
      },
    });

    expect(result).toEqual([
      messages[0],
      {
        id: 3,
        role: "assistant",
        content: "answer",
        reply_to_message_id: 1,
        status: "succeeded",
        sources_json: [],
      },
    ]);
  });

  it("ignores runs that belong to a different session", () => {
    const messages: ChatMessageItem[] = [
      {
        id: 1,
        role: "user",
        content: "hello",
        status: "succeeded",
        sources_json: null,
      },
    ];

    const result = buildDisplayMessages({
      activeSessionId: 1,
      messages,
      runsById: {
        11: {
          assistantMessageId: 4,
          content: "other session",
          errorMessage: null,
          runId: 11,
          sessionId: 2,
          userMessageId: 2,
          userContent: "hello",
          status: "streaming",
          toastShown: false,
        },
      },
    });

    expect(result).toEqual(messages);
  });

  it("keeps temporary assistant failure details when a stream ends unexpectedly", () => {
    const messages: ChatMessageItem[] = [
      {
        id: 1,
        role: "user",
        content: "hello",
        status: "succeeded",
        sources_json: null,
      },
    ];

    const result = buildDisplayMessages({
      activeSessionId: 1,
      messages,
      runsById: {
        12: {
          assistantMessageId: 5,
          content: "作为",
          errorMessage: "本次生成连接中断，请重试。",
          runId: 12,
          sessionId: 1,
          userMessageId: 1,
          userContent: "hello",
          status: "failed",
          toastShown: false,
        },
      },
    });

    expect(result).toEqual([
      messages[0],
      {
        id: 5,
        role: "assistant",
        content: "作为",
        reply_to_message_id: 1,
        error_message: "本次生成连接中断，请重试。",
        status: "failed",
        sources_json: [],
      },
    ]);
  });

  it("marks a historical pending assistant message as failed when newer messages already exist", () => {
    const messages: ChatMessageItem[] = [
      {
        id: 1,
        role: "user",
        content: "第一问",
        status: "succeeded",
        sources_json: null,
      },
      {
        id: 2,
        role: "assistant",
        content: "",
        status: "pending",
        sources_json: [],
      },
      {
        id: 3,
        role: "user",
        content: "第二问",
        status: "succeeded",
        sources_json: null,
      },
      {
        id: 4,
        role: "assistant",
        content: "后续回答",
        status: "succeeded",
        sources_json: [],
      },
    ];

    const result = buildDisplayMessages({
      activeSessionId: 1,
      messages,
      runsById: {},
    });

    expect(result[1]).toEqual({
      ...messages[1],
      status: "failed",
    });
  });

  it("marks a trailing pending assistant message as failed when there is no local active run", () => {
    const messages: ChatMessageItem[] = [
      {
        id: 1,
        role: "user",
        content: "最后一问",
        status: "succeeded",
        sources_json: null,
      },
      {
        id: 2,
        role: "assistant",
        content: "",
        status: "pending",
        reply_to_message_id: 1,
        sources_json: [],
      },
    ];

    const result = buildDisplayMessages({
      activeSessionId: 1,
      messages,
      runsById: {},
    });

    expect(result[1]).toEqual({
      ...messages[1],
      status: "failed",
    });
  });

  it("does not let a stale local streaming run override a newer persisted terminal state", () => {
    const messages: ChatMessageItem[] = [
      {
        id: 1,
        role: "user",
        content: "hello",
        status: "succeeded",
        sources_json: null,
      },
      {
        id: 2,
        role: "assistant",
        content: "",
        status: "failed",
        sources_json: [],
      },
      {
        id: 3,
        role: "user",
        content: "newer message",
        status: "succeeded",
        sources_json: null,
      },
    ];

    const result = buildDisplayMessages({
      activeSessionId: 1,
      messages,
      runsById: {
        9: {
          assistantMessageId: 2,
          content: "still streaming",
          errorMessage: null,
          runId: 9,
          sessionId: 1,
          userMessageId: 1,
          userContent: "hello",
          status: "streaming",
          toastShown: false,
        },
      },
    });

    expect(result[1]).toEqual(messages[1]);
  });

  it("does not let a stale local streaming run override a persisted succeeded assistant message with the same id", () => {
    const messages: ChatMessageItem[] = [
      {
        id: 1,
        role: "user",
        content: "hello",
        status: "succeeded",
        sources_json: null,
      },
      {
        id: 2,
        role: "assistant",
        content: "final answer",
        status: "succeeded",
        reply_to_message_id: 1,
        sources_json: [],
      },
    ];

    const result = buildDisplayMessages({
      activeSessionId: 1,
      messages,
      runsById: {
        10: {
          assistantMessageId: 2,
          content: "",
          errorMessage: null,
          runId: 10,
          sessionId: 1,
          userMessageId: 1,
          userContent: "hello",
          status: "streaming",
          toastShown: false,
        },
      },
    });

    expect(result[1]).toEqual(messages[1]);
  });

  it("collapses a persisted retry chain into the latest assistant attempt", () => {
    const messages: ChatMessageItem[] = [
      {
        id: 1,
        role: "user",
        content: "这个图描述了什么",
        status: "succeeded",
        sources_json: null,
      },
      {
        id: 2,
        role: "assistant",
        content: "",
        status: "failed",
        reply_to_message_id: 1,
        error_message: "本次回复生成失败，请点击重试或重新提问。",
        sources_json: [],
      },
      {
        id: 3,
        role: "user",
        content: "这个图描述了什么",
        status: "succeeded",
        retry_of_message_id: 1,
        sources_json: null,
      },
      {
        id: 4,
        role: "assistant",
        content: "这是一张男性肖像。",
        status: "succeeded",
        reply_to_message_id: 3,
        sources_json: [],
      },
    ];

    const result = buildDisplayMessages({
      activeSessionId: 1,
      messages,
      runsById: {},
    });

    expect(result).toEqual([
      {
        ...messages[2],
      },
      {
        ...messages[3],
      },
    ]);
  });

  it("replaces a failed assistant card with the local retry run while streaming", () => {
    const messages: ChatMessageItem[] = [
      {
        id: 1,
        role: "user",
        content: "这个图描述了什么",
        status: "succeeded",
        sources_json: null,
      },
      {
        id: 2,
        role: "assistant",
        content: "",
        status: "failed",
        reply_to_message_id: 1,
        error_message: "本次回复生成失败，请点击重试或重新提问。",
        sources_json: [],
      },
    ];

    const result = buildDisplayMessages({
      activeSessionId: 1,
      messages,
      runsById: {
        5: {
          assistantMessageId: 4,
          content: "根据提供的检索资源，",
          errorMessage: null,
          runId: 5,
          sessionId: 1,
          userMessageId: 3,
          userContent: "这个图描述了什么",
          retryOfMessageId: 1,
          status: "streaming",
          toastShown: false,
        },
      },
    });

    expect(result).toEqual([
      messages[0],
      {
        id: 4,
        role: "assistant",
        content: "根据提供的检索资源，",
        reply_to_message_id: 1,
        status: "streaming",
        sources_json: [],
      },
    ]);
  });
});
