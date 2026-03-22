import { getAccessToken, setAccessToken } from "@/lib/auth/token-store";
import { startChatStream } from "./chat-stream";

function apiPath(path: string) {
  return expect.stringMatching(new RegExp(`${path.replaceAll("/", "\\/")}$`));
}

function createStreamResponse(chunks: Array<string | Uint8Array>) {
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    start(controller) {
      for (const chunk of chunks) {
        controller.enqueue(typeof chunk === "string" ? encoder.encode(chunk) : chunk);
      }
      controller.close();
    },
  });

  return {
    ok: true,
    body: stream,
  };
}

describe("chat stream api", () => {
  beforeEach(() => {
    setAccessToken(null);
  });

  it("posts to the streaming endpoint and parses SSE-style events", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(
        createStreamResponse([
          'event: run.started\ndata: {"run_id":1,"assistant_message_id":11}\n\n',
          'event: message.delta\ndata: {"run_id":1,"assistant_message_id":11,"delta":"hello "}\n\n',
          'event: message.delta\ndata: {"run_id":1,"assistant_message_id":11,"delta":"world"}\n\n',
          'event: run.completed\ndata: {"run_id":1,"assistant_message_id":11}\n\n',
          "event: done\ndata: {}\n\n",
        ]),
      );
    vi.stubGlobal("fetch", fetchMock);

    const events: Array<{ event: string; data: Record<string, unknown> }> = [];

    await startChatStream({
      sessionId: 7,
      body: {
        content: "hello",
        client_request_id: "req-stream-1",
      },
      onEvent: (event) => events.push(event),
    });

    expect(fetchMock).toHaveBeenCalledWith(
      apiPath("/api/chat/sessions/7/messages/stream"),
      expect.objectContaining({ method: "POST", credentials: "include" }),
    );
    expect(events.map((event) => event.event)).toEqual([
      "run.started",
      "message.delta",
      "message.delta",
      "run.completed",
      "done",
    ]);
    expect(events[1]?.data.delta).toBe("hello ");
    expect(events[2]?.data.delta).toBe("world");
  });

  it("attaches the bearer token when streaming with an authenticated session", async () => {
    setAccessToken("stream-token");

    const fetchMock = vi
      .fn()
      .mockResolvedValue(
        createStreamResponse([
          'event: run.completed\ndata: {"run_id":1,"assistant_message_id":11}\n\n',
        ]),
      );
    vi.stubGlobal("fetch", fetchMock);

    await startChatStream({
      sessionId: 7,
      body: {
        content: "hello",
        client_request_id: "req-stream-auth-header",
      },
      onEvent: () => {},
    });

    const [, requestInit] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(new Headers(requestInit.headers).get("Authorization")).toBe("Bearer stream-token");
  });

  it("refreshes the access token and retries the stream request after an unauthorized response", async () => {
    setAccessToken("expired-token");

    const fetchMock = vi.fn().mockImplementation((input: string) => {
      if (input.endsWith("/api/auth/refresh")) {
        return Promise.resolve(
          new Response(
            JSON.stringify({
              success: true,
              data: {
                access_token: "fresh-token",
                expires_in: 900,
                token_type: "Bearer",
              },
              error: null,
            }),
            {
              status: 200,
              headers: { "Content-Type": "application/json" },
            },
          ),
        );
      }

      const bearer = new Headers(
        (fetchMock.mock.calls.at(-1)?.[1] as RequestInit | undefined)?.headers,
      ).get("Authorization");

      if (
        input.endsWith("/api/chat/sessions/7/messages/stream") &&
        bearer === "Bearer expired-token"
      ) {
        return Promise.resolve(new Response("", { status: 401, statusText: "Unauthorized" }));
      }

      return Promise.resolve(
        createStreamResponse([
          'event: run.completed\ndata: {"run_id":1,"assistant_message_id":11}\n\n',
        ]),
      );
    });
    vi.stubGlobal("fetch", fetchMock);

    await startChatStream({
      sessionId: 7,
      body: {
        content: "hello",
        client_request_id: "req-stream-refresh",
      },
      onEvent: () => {},
    });

    const streamCalls = fetchMock.mock.calls.filter(([url]) =>
      String(url).endsWith("/api/chat/sessions/7/messages/stream"),
    );
    expect(streamCalls).toHaveLength(2);
    const retryRequestInit = streamCalls[1]?.[1] as RequestInit | undefined;
    expect(retryRequestInit).toBeDefined();
    expect(new Headers(retryRequestInit?.headers).get("Authorization")).toBe("Bearer fresh-token");
    expect(getAccessToken()).toBe("fresh-token");
  });

  it("handles chunked frames and trailing failure events", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(
        createStreamResponse([
          'event: run.started\ndata: {"run_id":1,"assistant_message_id":11,"user_message_id":9}\n',
          "\n",
          'event: run.failed\ndata: {"run_id":1,"error_message":"provider failed"}',
        ]),
      );
    vi.stubGlobal("fetch", fetchMock);

    const events: Array<{ event: string; data: Record<string, unknown> }> = [];

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

    expect(events.map((event) => event.event)).toEqual(["run.started", "run.failed"]);
  });

  it("supports events whose JSON payload spans multiple data lines", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(
        createStreamResponse([
          [
            "event: message.delta",
            'data: {"run_id":1,',
            'data: "assistant_message_id":11,',
            'data: "delta":"hello"}',
            "",
            'event: run.completed\ndata: {"run_id":1,"assistant_message_id":11}',
            "",
          ].join("\n"),
        ]),
      );
    vi.stubGlobal("fetch", fetchMock);

    const events: Array<{ event: string; data: Record<string, unknown> }> = [];

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
      event: "message.delta",
      data: { assistant_message_id: 11, delta: "hello", run_id: 1 },
    });
    expect(events[1]?.event).toBe("run.completed");
  });

  it("flushes trailing decoder bytes when a multibyte delta is split across chunks", async () => {
    const encoder = new TextEncoder();
    const frame = encoder.encode(
      [
        'event: message.delta\ndata: {"run_id":1,"assistant_message_id":11,"delta":"你"}',
        "",
        'event: run.completed\ndata: {"run_id":1,"assistant_message_id":11}',
        "",
      ].join("\n"),
    );
    const splitIndex = frame.indexOf(0xe4) + 1;
    const fetchMock = vi
      .fn()
      .mockResolvedValue(
        createStreamResponse([frame.slice(0, splitIndex), frame.slice(splitIndex)]),
      );
    vi.stubGlobal("fetch", fetchMock);

    const events: Array<{ event: string; data: Record<string, unknown> }> = [];

    await startChatStream({
      sessionId: 7,
      body: {
        content: "hello",
        client_request_id: "req-stream-3",
      },
      onEvent: (event) => events.push(event),
    });

    expect(events).toHaveLength(2);
    expect(events[0]?.data.delta).toBe("你");
    expect(events[1]?.event).toBe("run.completed");
  });

  it("parses events when the stream starts with a BOM and uses CRLF separators", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(
        createStreamResponse([
          [
            "\uFEFFevent: part.text.delta",
            'data: {"run_id":1,"assistant_message_id":11,"delta":"hello"}',
            "",
            "event: run.completed",
            'data: {"run_id":1,"assistant_message_id":11}',
            "",
          ].join("\r\n"),
        ]),
      );
    vi.stubGlobal("fetch", fetchMock);

    const events: Array<{ event: string; data: Record<string, unknown> }> = [];

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
        event: "run.completed",
        data: { assistant_message_id: 11, run_id: 1 },
      },
    ]);
  });

  it("rejects when the stream ends before a terminal run event arrives", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(
        createStreamResponse([
          'event: run.started\ndata: {"run_id":1,"assistant_message_id":11}\n\n',
          'event: message.delta\ndata: {"run_id":1,"assistant_message_id":11,"delta":"partial"}\n\n',
        ]),
      );
    vi.stubGlobal("fetch", fetchMock);

    const events: Array<{ event: string; data: Record<string, unknown> }> = [];

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

    expect(events.map((event) => event.event)).toEqual(["run.started", "message.delta"]);
  });

  it("surfaces the backend error message when the stream request is rejected before SSE starts", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          detail: {
            code: "chat_message_conflict",
            message: "client_request_id already exists for a different message payload.",
          },
        }),
        {
          status: 409,
          headers: { "Content-Type": "application/json" },
        },
      ),
    );
    vi.stubGlobal("fetch", fetchMock);

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
});
