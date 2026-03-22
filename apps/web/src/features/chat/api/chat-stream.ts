/**
 * @file 聊天相关接口请求模块。
 */

import { parseServerSentEvents, type ServerSentEvent } from "parse-sse";

import { authenticatedFetch } from "@/lib/api/authenticated-fetch";
import { extractErrorDetail, getUserFacingErrorMessage } from "@/lib/api/error-response";
import { env } from "@/lib/config/env";

/**
 * 描述聊天流式事件的数据结构。
 */
export type ChatStreamEvent = {
  event: string;
  data: Record<string, unknown>;
};

/**
 * 描述聊天流式附件输入的数据结构。
 */
export type ChatStreamAttachmentInput = {
  attachment_id: string;
  type: "image" | "document";
  name: string;
  mime_type: string;
  size_bytes: number;
  document_id?: number;
  document_revision_id: number;
};

type StartChatStreamResult = {
  userMessageId: number | null;
};

type StartChatStreamInput = {
  sessionId: number;
  body: {
    attachments?: ChatStreamAttachmentInput[];
    content: string;
    client_request_id: string;
    retry_of_message_id?: number;
  };
  onEvent: (event: ChatStreamEvent) => void;
};

type ParsedChatStreamState = {
  failedMessage: string | null;
  hasTerminalRunEvent: boolean;
  lastRunId: number | null;
  userMessageId: number | null;
};

function consumeEvent(
  event: ChatStreamEvent,
  state: ParsedChatStreamState,
  onEvent: StartChatStreamInput["onEvent"],
) {
  if (event.event === "run.started" && typeof event.data.user_message_id === "number") {
    state.userMessageId = event.data.user_message_id;
  }

  if (typeof event.data.run_id === "number") {
    state.lastRunId = event.data.run_id;
  }

  if (
    event.event === "run.failed" &&
    typeof event.data.error_message === "string" &&
    event.data.error_message
  ) {
    state.failedMessage = event.data.error_message;
  }

  if (event.event === "run.completed" || event.event === "run.failed") {
    state.hasTerminalRunEvent = true;
  }

  onEvent(event);
}

function toChatStreamEvent(event: ServerSentEvent): ChatStreamEvent {
  return {
    event: event.type,
    data: JSON.parse(event.data) as Record<string, unknown>,
  };
}

export async function startChatStream({ sessionId, body, onEvent }: StartChatStreamInput) {
  const response = await authenticatedFetch(
    `${env.apiBaseUrl}/api/chat/sessions/${sessionId}/messages/stream`,
    {
      body: JSON.stringify(body),
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      method: "POST",
    },
  );

  if (!response.ok) {
    const rawBody = await response.text();
    let parsedBody: unknown = null;

    try {
      parsedBody = rawBody ? (JSON.parse(rawBody) as unknown) : null;
    } catch {
      parsedBody = null;
    }

    const detail = extractErrorDetail(rawBody, parsedBody, response);
    throw new Error(getUserFacingErrorMessage(detail, response));
  }

  if (!response.body) {
    throw new Error("chat stream request failed");
  }

  const state: ParsedChatStreamState = {
    failedMessage: null,
    hasTerminalRunEvent: false,
    lastRunId: null,
    userMessageId: null,
  };

  const eventReader = parseServerSentEvents(response as Response).getReader();

  try {
    while (true) {
      const { done, value } = await eventReader.read();
      if (done) {
        break;
      }

      consumeEvent(toChatStreamEvent(value), state, onEvent);
    }
  } finally {
    eventReader.releaseLock();
  }

  if (state.failedMessage) {
    throw new Error(state.failedMessage);
  }

  if (state.lastRunId !== null && !state.hasTerminalRunEvent) {
    throw new Error("chat stream terminated unexpectedly");
  }

  return { userMessageId: state.userMessageId } satisfies StartChatStreamResult;
}
