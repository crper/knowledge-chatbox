import { getAccessToken, setAccessToken } from "@/lib/auth/token-store";
import { http, HttpResponse } from "msw";
import {
  createChatStreamFrame,
  createChatStreamResponse,
  createRawChatStreamFrame,
} from "@/test/chat-stream";
import { overrideHandler } from "@/test/msw";
import { startChatStream } from "./chat-stream";
import { CHAT_STREAM_EVENT, type ChatStreamEvent } from "./chat-stream-events";

describe("chat stream api", () => {
  beforeEach(() => {
    setAccessToken(null);
  });

  it("posts to the streaming endpoint and parses SSE-style events", async () => {
    overrideHandler(
      http.post("*/api/chat/sessions/7/messages/stream", () => {
        return createChatStreamResponse([
          createChatStreamFrame(CHAT_STREAM_EVENT.runStarted, {
            run_id: 1,
            assistant_message_id: 11,
          }),
          createChatStreamFrame(CHAT_STREAM_EVENT.partTextDelta, {
            run_id: 1,
            assistant_message_id: 11,
            delta: "hello ",
          }),
          createChatStreamFrame(CHAT_STREAM_EVENT.partTextDelta, {
            run_id: 1,
            assistant_message_id: 11,
            delta: "world",
          }),
          createChatStreamFrame(CHAT_STREAM_EVENT.runCompleted, {
            run_id: 1,
            assistant_message_id: 11,
          }),
          createChatStreamFrame(CHAT_STREAM_EVENT.done, {}),
        ]);
      }),
    );

    const events: ChatStreamEvent[] = [];

    await startChatStream({
      sessionId: 7,
      body: {
        content: "hello",
        client_request_id: "req-stream-1",
      },
      onEvent: (event) => events.push(event),
    });

    expect(events.map((event) => event.event)).toEqual([
      CHAT_STREAM_EVENT.runStarted,
      CHAT_STREAM_EVENT.partTextDelta,
      CHAT_STREAM_EVENT.partTextDelta,
      CHAT_STREAM_EVENT.runCompleted,
      CHAT_STREAM_EVENT.done,
    ]);
    expect(events[1]).toMatchObject({
      event: CHAT_STREAM_EVENT.partTextDelta,
      data: { delta: "hello " },
    });
    expect(events[2]).toMatchObject({
      event: CHAT_STREAM_EVENT.partTextDelta,
      data: { delta: "world" },
    });
  });

  it("attaches the bearer token when streaming with an authenticated session", async () => {
    setAccessToken("stream-token");

    overrideHandler(
      http.post("*/api/chat/sessions/7/messages/stream", ({ request }) => {
        const authHeader = request.headers.get("Authorization");
        expect(authHeader).toBe("Bearer stream-token");

        return createChatStreamResponse([
          createChatStreamFrame(CHAT_STREAM_EVENT.runCompleted, {
            run_id: 1,
            assistant_message_id: 11,
          }),
        ]);
      }),
    );

    await startChatStream({
      sessionId: 7,
      body: {
        content: "hello",
        client_request_id: "req-stream-auth-header",
      },
      onEvent: () => {},
    });
  });

  it("refreshes the access token and retries the stream request after an unauthorized response", async () => {
    setAccessToken("expired-token");

    let callCount = 0;

    overrideHandler(
      http.post("*/api/chat/sessions/7/messages/stream", ({ request }) => {
        callCount++;
        const authHeader = request.headers.get("Authorization");

        if (callCount === 1 && authHeader === "Bearer expired-token") {
          return new HttpResponse(null, { status: 401, statusText: "Unauthorized" });
        }

        return createChatStreamResponse([
          createChatStreamFrame(CHAT_STREAM_EVENT.runCompleted, {
            run_id: 1,
            assistant_message_id: 11,
          }),
        ]);
      }),
    );

    overrideHandler(
      http.post("*/api/auth/refresh", () => {
        return HttpResponse.json({
          success: true,
          data: {
            access_token: "fresh-token",
            expires_in: 900,
            token_type: "Bearer",
          },
          error: null,
        });
      }),
    );

    await startChatStream({
      sessionId: 7,
      body: {
        content: "hello",
        client_request_id: "req-stream-refresh",
      },
      onEvent: () => {},
    });

    expect(callCount).toBe(2);
    expect(getAccessToken()).toBe("fresh-token");
  });

  it("handles chunked frames and trailing failure events", async () => {
    overrideHandler(
      http.post("*/api/chat/sessions/7/messages/stream", () => {
        return createChatStreamResponse([
          createRawChatStreamFrame(
            CHAT_STREAM_EVENT.runStarted,
            ['{"run_id":1,"assistant_message_id":11,"user_message_id":9}'],
            { trailingBlankLine: false },
          ),
          "\n\n",
          createRawChatStreamFrame(
            CHAT_STREAM_EVENT.runFailed,
            ['{"run_id":1,"error_message":"provider failed"}'],
            { trailingBlankLine: false },
          ),
        ]);
      }),
    );

    const events: ChatStreamEvent[] = [];

    await expect(
      startChatStream({
        sessionId: 7,
        body: {
          content: "hello",
          client_request_id: "req-stream-2",
        },
        onEvent: (event) => events.push(event),
      }),
    ).rejects.toThrow("provider failed");

    expect(events.map((event) => event.event)).toEqual([
      CHAT_STREAM_EVENT.runStarted,
      CHAT_STREAM_EVENT.runFailed,
    ]);
  });

  it("supports events whose JSON payload spans multiple data lines", async () => {
    overrideHandler(
      http.post("*/api/chat/sessions/7/messages/stream", () => {
        return createChatStreamResponse([
          [
            `event: ${CHAT_STREAM_EVENT.partTextDelta}`,
            'data: {"run_id":1,',
            'data: "assistant_message_id":11,',
            'data: "delta":"hello"}',
            "",
            createRawChatStreamFrame(
              CHAT_STREAM_EVENT.runCompleted,
              ['{"run_id":1,"assistant_message_id":11}'],
              { trailingBlankLine: false },
            ),
            "",
          ].join("\n"),
        ]);
      }),
    );

    const events: ChatStreamEvent[] = [];

    await startChatStream({
      sessionId: 7,
      body: {
        content: "hello",
        client_request_id: "req-stream-2b",
      },
      onEvent: (event) => events.push(event),
    });

    expect(events).toHaveLength(2);
    expect(events[0]).toMatchObject({
      event: CHAT_STREAM_EVENT.partTextDelta,
      data: { assistant_message_id: 11, delta: "hello", run_id: 1 },
    });
    expect(events[1]?.event).toBe(CHAT_STREAM_EVENT.runCompleted);
  });

  it("flushes trailing decoder bytes when a multibyte delta is split across chunks", async () => {
    const encoder = new TextEncoder();
    const frame = encoder.encode(
      [
        createRawChatStreamFrame(
          CHAT_STREAM_EVENT.partTextDelta,
          ['{"run_id":1,"assistant_message_id":11,"delta":"你"}'],
          { trailingBlankLine: false },
        ),
        "",
        createRawChatStreamFrame(
          CHAT_STREAM_EVENT.runCompleted,
          ['{"run_id":1,"assistant_message_id":11}'],
          { trailingBlankLine: false },
        ),
        "",
      ].join("\n"),
    );
    const splitIndex = frame.indexOf(0xe4) + 1;

    overrideHandler(
      http.post("*/api/chat/sessions/7/messages/stream", () => {
        return createChatStreamResponse([frame.slice(0, splitIndex), frame.slice(splitIndex)]);
      }),
    );

    const events: ChatStreamEvent[] = [];

    await startChatStream({
      sessionId: 7,
      body: {
        content: "hello",
        client_request_id: "req-stream-3",
      },
      onEvent: (event) => events.push(event),
    });

    expect(events).toHaveLength(2);
    expect(events[0]).toMatchObject({
      event: CHAT_STREAM_EVENT.partTextDelta,
      data: { delta: "你" },
    });
    expect(events[1]?.event).toBe(CHAT_STREAM_EVENT.runCompleted);
  });

  it("parses events when the stream starts with a BOM and uses CRLF separators", async () => {
    overrideHandler(
      http.post("*/api/chat/sessions/7/messages/stream", () => {
        return createChatStreamResponse([
          [
            `\uFEFFevent: ${CHAT_STREAM_EVENT.partTextDelta}`,
            'data: {"run_id":1,"assistant_message_id":11,"delta":"hello"}',
            "",
            `event: ${CHAT_STREAM_EVENT.runCompleted}`,
            'data: {"run_id":1,"assistant_message_id":11}',
            "",
          ].join("\r\n"),
        ]);
      }),
    );

    const events: ChatStreamEvent[] = [];

    await startChatStream({
      sessionId: 7,
      body: {
        content: "hello",
        client_request_id: "req-stream-3b",
      },
      onEvent: (event) => events.push(event),
    });

    expect(events).toEqual([
      {
        event: "part.text.delta",
        data: { assistant_message_id: 11, delta: "hello", run_id: 1 },
      },
      {
        event: CHAT_STREAM_EVENT.runCompleted,
        data: { assistant_message_id: 11, run_id: 1 },
      },
    ]);
  });

  it("rejects when the stream ends before a terminal run event arrives", async () => {
    overrideHandler(
      http.post("*/api/chat/sessions/7/messages/stream", () => {
        return createChatStreamResponse([
          createChatStreamFrame(CHAT_STREAM_EVENT.runStarted, {
            run_id: 1,
            assistant_message_id: 11,
          }),
          createChatStreamFrame(CHAT_STREAM_EVENT.partTextDelta, {
            run_id: 1,
            assistant_message_id: 11,
            delta: "partial",
          }),
        ]);
      }),
    );

    const events: ChatStreamEvent[] = [];

    await expect(
      startChatStream({
        sessionId: 7,
        body: {
          content: "hello",
          client_request_id: "req-stream-4",
        },
        onEvent: (event) => events.push(event),
      }),
    ).rejects.toThrow("chat stream terminated unexpectedly");

    expect(events.map((event) => event.event)).toEqual([
      CHAT_STREAM_EVENT.runStarted,
      CHAT_STREAM_EVENT.partTextDelta,
    ]);
  });

  it("fails fast when the backend sends an unknown event name", async () => {
    overrideHandler(
      http.post("*/api/chat/sessions/7/messages/stream", () => {
        return createChatStreamResponse([
          createRawChatStreamFrame("mystery.event", ['{"run_id":1}']),
        ]);
      }),
    );

    await expect(
      startChatStream({
        sessionId: 7,
        body: {
          content: "hello",
          client_request_id: "req-stream-unknown-event",
        },
        onEvent: () => {},
      }),
    ).rejects.toThrow("unknown chat stream event: mystery.event");
  });

  it("surfaces the backend error message when the stream request is rejected before SSE starts", async () => {
    overrideHandler(
      http.post("*/api/chat/sessions/7/messages/stream", () => {
        return HttpResponse.json(
          {
            detail: {
              code: "chat_message_conflict",
              message: "client_request_id already exists for a different message payload.",
            },
          },
          { status: 409 },
        );
      }),
    );

    await expect(
      startChatStream({
        sessionId: 7,
        body: {
          content: "hello",
          client_request_id: "req-stream-5",
        },
        onEvent: () => {},
      }),
    ).rejects.toThrow("client_request_id already exists for a different message payload.");
  });

  it("aborts the active stream when the caller cancels the request", async () => {
    overrideHandler(
      http.post("*/api/chat/sessions/7/messages/stream", ({ request }) => {
        const stream = new ReadableStream({
          start(controller) {
            request.signal.addEventListener(
              "abort",
              () => {
                controller.error(new DOMException("The operation was aborted.", "AbortError"));
              },
              { once: true },
            );
          },
        });

        return new Response(stream, {
          status: 200,
          headers: { "Content-Type": "text/event-stream" },
        });
      }),
    );

    const controller = new AbortController();
    const streamPromise = startChatStream({
      sessionId: 7,
      body: {
        content: "hello",
        client_request_id: "req-stream-abort",
      },
      onEvent: () => {},
      signal: controller.signal,
    });

    controller.abort();

    await expect(streamPromise).rejects.toMatchObject({ name: "AbortError" });
  });
});
