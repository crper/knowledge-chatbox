import type { ChatSourceItem } from "./chat";

export const CHAT_STREAM_EVENT = {
  done: "done",
  messageCompleted: "message.completed",
  messageStarted: "message.started",
  partSource: "part.source",
  partTextDelta: "part.text.delta",
  partTextEnd: "part.text.end",
  partTextStart: "part.text.start",
  runCompleted: "run.completed",
  runFailed: "run.failed",
  runStarted: "run.started",
  toolCall: "tool.call",
  toolResult: "tool.result",
  usageFinal: "usage.final",
} as const;

type ChatStreamSourcePayload = ChatSourceItem;

export type ChatStreamEventMap = {
  done: Record<string, unknown>;
  "message.completed": {
    assistant_message_id: number;
    run_id: number;
    status: string;
  };
  "message.started": {
    assistant_message_id: number;
    role: string;
    run_id: number;
  };
  "part.source": {
    assistant_message_id: number;
    run_id: number;
    source: ChatStreamSourcePayload;
  };
  "part.text.delta": {
    assistant_message_id?: number;
    delta: string;
    run_id: number;
  };
  "part.text.end": {
    assistant_message_id: number;
    run_id: number;
  };
  "part.text.start": {
    assistant_message_id: number;
    run_id: number;
  };
  "run.completed": {
    assistant_message_id: number;
    run_id: number;
    session_id?: number;
  };
  "run.failed": {
    assistant_message_id?: number;
    error_message: string;
    run_id: number;
    session_id?: number;
  };
  "run.started": {
    assistant_message_id?: number;
    run_id: number;
    session_id?: number;
    user_message_id?: number;
  };
  "tool.call": {
    input: Record<string, unknown>;
    run_id: number;
    tool_name: string;
  };
  "tool.result": {
    run_id: number;
    sources_count?: number;
    tool_name: string;
  };
  "usage.final": {
    run_id: number;
    usage: Record<string, unknown>;
  };
};

export type ChatStreamEventName = keyof ChatStreamEventMap;

export type ChatStreamEvent = {
  [K in ChatStreamEventName]: {
    event: K;
    data: ChatStreamEventMap[K];
  };
}[ChatStreamEventName];

export function isChatStreamEventName(value: string): value is ChatStreamEventName {
  return CHAT_STREAM_EVENT_NAME_SET.has(value as ChatStreamEventName);
}

const CHAT_STREAM_EVENT_NAME_SET = new Set<ChatStreamEventName>(Object.values(CHAT_STREAM_EVENT));
