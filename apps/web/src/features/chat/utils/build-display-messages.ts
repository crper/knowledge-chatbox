/**
 * @file 聊天相关工具模块。
 */

import type { ChatMessageItem } from "../api/chat";
import type { StreamingRun } from "../store/chat-stream-store";

function isStreamingStatus(status: string) {
  return status === "pending" || status === "streaming";
}

function normalizePersistedMessages(
  messages: ChatMessageItem[],
  activeStreamingAssistantMessageIds: Set<number>,
  maxPersistedMessageId: number,
) {
  return messages.map((message) => {
    if (
      message.role === "assistant" &&
      isStreamingStatus(message.status) &&
      (message.id < maxPersistedMessageId || !activeStreamingAssistantMessageIds.has(message.id))
    ) {
      return {
        ...message,
        status: "failed",
      };
    }

    return message;
  });
}

function resolveRetryRootUserMessageId(
  messageById: Map<number, ChatMessageItem>,
  userMessageId: number,
) {
  const visitedMessageIds = new Set<number>();
  let currentMessageId = userMessageId;

  while (!visitedMessageIds.has(currentMessageId)) {
    visitedMessageIds.add(currentMessageId);
    const currentMessage = messageById.get(currentMessageId);
    if (currentMessage?.role !== "user" || currentMessage.retry_of_message_id == null) {
      return currentMessageId;
    }
    currentMessageId = currentMessage.retry_of_message_id;
  }

  return currentMessageId;
}

function collapseRetryMessageAttempts(messages: ChatMessageItem[]) {
  const messageById = new Map(messages.map((message) => [message.id, message]));
  const latestUserAttemptByRootId = new Map<number, ChatMessageItem>();
  const latestAssistantAttemptByRootId = new Map<number, ChatMessageItem>();

  messages.forEach((message) => {
    if (message.role === "user") {
      const rootUserMessageId = resolveRetryRootUserMessageId(messageById, message.id);
      latestUserAttemptByRootId.set(rootUserMessageId, message);
      return;
    }

    if (message.role === "assistant" && typeof message.reply_to_message_id === "number") {
      const rootUserMessageId = resolveRetryRootUserMessageId(
        messageById,
        message.reply_to_message_id,
      );
      latestAssistantAttemptByRootId.set(rootUserMessageId, message);
    }
  });

  return messages.flatMap((message) => {
    if (message.role === "user") {
      if (message.retry_of_message_id != null) {
        return [];
      }

      return [latestUserAttemptByRootId.get(message.id) ?? message];
    }

    if (message.role === "assistant" && typeof message.reply_to_message_id === "number") {
      const rootUserMessageId = resolveRetryRootUserMessageId(
        messageById,
        message.reply_to_message_id,
      );
      return latestAssistantAttemptByRootId.get(rootUserMessageId)?.id === message.id
        ? [message]
        : [];
    }

    return [message];
  });
}

/**
 * 构建显示消息。
 */
export function buildDisplayMessages({
  activeSessionId,
  messages,
  runsById,
}: {
  activeSessionId: number | null;
  messages: ChatMessageItem[];
  runsById: Record<number, StreamingRun>;
}) {
  const streamingRuns =
    activeSessionId === null
      ? []
      : Object.values(runsById)
          .filter((run) => run.sessionId === activeSessionId)
          .sort((left, right) => left.assistantMessageId - right.assistantMessageId);
  const activeStreamingAssistantMessageIds = new Set(
    streamingRuns
      .filter((run) => isStreamingStatus(run.status))
      .map((run) => run.assistantMessageId),
  );
  const maxPersistedMessageId = messages.reduce(
    (currentMax, message) => Math.max(currentMax, message.id),
    0,
  );
  const normalizedMessages = normalizePersistedMessages(
    messages,
    activeStreamingAssistantMessageIds,
    maxPersistedMessageId,
  );
  const collapsedPersistedMessages = collapseRetryMessageAttempts(normalizedMessages);

  if (activeSessionId === null) {
    return collapsedPersistedMessages;
  }

  if (streamingRuns.length === 0) {
    return collapsedPersistedMessages;
  }

  const nextMessages = [...normalizedMessages];
  const messageIndexById = new Map(nextMessages.map((message, index) => [message.id, index]));
  for (const run of streamingRuns) {
    if (isStreamingStatus(run.status) && run.assistantMessageId < maxPersistedMessageId) {
      continue;
    }

    const existingIndex = messageIndexById.get(run.assistantMessageId) ?? -1;

    if (existingIndex >= 0) {
      const existingMessage = nextMessages[existingIndex]!;
      const hasPersistedTerminalAssistantState =
        existingMessage.role === "assistant" && !isStreamingStatus(existingMessage.status);

      if (hasPersistedTerminalAssistantState && run.status !== "succeeded") {
        continue;
      }

      nextMessages[existingIndex] = {
        ...existingMessage,
        content: run.content || existingMessage.content,
        reply_to_message_id:
          run.retryOfMessageId ?? run.userMessageId ?? existingMessage.reply_to_message_id,
        ...(run.errorMessage ? { error_message: run.errorMessage } : {}),
        sources_json:
          (run.sources ?? []).length > 0
            ? (run.sources as ChatMessageItem["sources_json"])
            : existingMessage.sources_json,
        status: run.status,
      };
      continue;
    }

    nextMessages.push({
      id: run.assistantMessageId,
      role: "assistant",
      content: run.content,
      reply_to_message_id: run.retryOfMessageId ?? run.userMessageId,
      ...(run.errorMessage ? { error_message: run.errorMessage } : {}),
      status: run.status,
      sources_json: (run.sources ?? []) as ChatMessageItem["sources_json"],
    });
    messageIndexById.set(run.assistantMessageId, nextMessages.length - 1);
  }

  return collapseRetryMessageAttempts(nextMessages);
}
