import type {
  ChatStreamEventMap,
  ChatStreamEventName,
} from "@/features/chat/api/chat-stream-events";

type ChatStreamChunk = string | Uint8Array;

type ChatStreamFrameOptions = {
  bom?: boolean;
  newline?: "\n" | "\r\n";
  trailingBlankLine?: boolean;
};

export function createChatStreamFrame<TEventName extends ChatStreamEventName>(
  event: TEventName,
  data: ChatStreamEventMap[TEventName],
  options: ChatStreamFrameOptions = {},
) {
  return createRawChatStreamFrame(event, [JSON.stringify(data)], options);
}

export function createRawChatStreamFrame(
  event: string,
  dataLines: string[],
  options: ChatStreamFrameOptions = {},
) {
  const newline = options.newline ?? "\n";
  const prefix = options.bom ? "\uFEFF" : "";
  const lines = [`${prefix}event: ${event}`, ...dataLines.map((line) => `data: ${line}`)];

  return `${lines.join(newline)}${options.trailingBlankLine === false ? "" : `${newline}${newline}`}`;
}

export function createChatStreamResponse(chunks: ChatStreamChunk[]) {
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    start(controller) {
      for (const chunk of chunks) {
        controller.enqueue(typeof chunk === "string" ? encoder.encode(chunk) : chunk);
      }
      controller.close();
    },
  });

  return new Response(stream, {
    status: 200,
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
}

export function getChatStreamEventPayload<TEventName extends ChatStreamEventName>(
  frames: string[],
  eventName: TEventName,
): ChatStreamEventMap[TEventName] | null {
  const frame = frames.find((item) =>
    item.replace(/^\uFEFF/, "").startsWith(`event: ${eventName}`),
  );
  if (!frame) {
    return null;
  }

  const dataLines = frame
    .replace(/^\uFEFF/, "")
    .split(/\r?\n/)
    .filter((line) => line.startsWith("data: "))
    .map((line) => line.slice("data: ".length));

  return JSON.parse(dataLines.join("\n")) as ChatStreamEventMap[TEventName];
}
