/**
 * 聊天相关工具模块。
 */

import { sortBy } from "es-toolkit";

import type { ChatMessageItem } from "../api/chat";
import type { StreamingRun } from "../store/chat-stream-store";
import { MessageRole, MessageStatus, isStreamingStatus } from "../constants";

function normalizePersistedMessages(
  messages: ChatMessageItem[],
  activeStreamingAssistantMessageIds: Set<number>,
  maxPersistedMessageId: number,
) {
  return messages.map((message) => {
    if (
      message.role === MessageRole.ASSISTANT &&
      isStreamingStatus(message.status) &&
      (message.id < maxPersistedMessageId || !activeStreamingAssistantMessageIds.has(message.id))
    ) {
      return {
        ...message,
        status: MessageStatus.FAILED,
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
    if (currentMessage?.role !== MessageRole.USER || currentMessage.retry_of_message_id == null) {
      return currentMessageId;
    }
    currentMessageId = currentMessage.retry_of_message_id;
  }

  return currentMessageId;
}

function shouldSuppressFailedAssistantPlaceholder(
  assistantMessage: ChatMessageItem,
  latestUserAttempt: ChatMessageItem | undefined,
): boolean {
  if (latestUserAttempt?.status !== MessageStatus.FAILED) return false;
  if (assistantMessage.status !== MessageStatus.FAILED) return false;
  return assistantMessage.content.trim().length === 0;
}

function collapseRetryMessageAttempts(messages: ChatMessageItem[]) {
  const messageById = new Map(messages.map((message) => [message.id, message]));
  const rootUserMessageIdCache = new Map<number, number>();
  const latestUserAttemptByRootId = new Map<number, ChatMessageItem>();
  const latestAssistantAttemptByRootId = new Map<number, ChatMessageItem>();
  const assistantAnchorMessageIdByRootId = new Map<number, number>();

  const getRootUserMessageId = (userMessageId: number) => {
    const cachedRootUserMessageId = rootUserMessageIdCache.get(userMessageId);
    if (cachedRootUserMessageId != null) {
      return cachedRootUserMessageId;
    }

    const rootUserMessageId = resolveRetryRootUserMessageId(messageById, userMessageId);
    rootUserMessageIdCache.set(userMessageId, rootUserMessageId);
    return rootUserMessageId;
  };

  messages.forEach((message) => {
    if (message.role === MessageRole.USER) {
      const rootUserMessageId = getRootUserMessageId(message.id);
      latestUserAttemptByRootId.set(rootUserMessageId, message);
      return;
    }

    if (message.role === MessageRole.ASSISTANT && typeof message.reply_to_message_id === "number") {
      const rootUserMessageId = getRootUserMessageId(message.reply_to_message_id);
      latestAssistantAttemptByRootId.set(rootUserMessageId, message);
      if (!assistantAnchorMessageIdByRootId.has(rootUserMessageId)) {
        assistantAnchorMessageIdByRootId.set(rootUserMessageId, message.id);
      }
    }
  });

  const emittedUserRootIds = new Set<number>();
  const emittedAssistantRootIds = new Set<number>();

  return messages.flatMap((message) => {
    // 处理用户消息
    if (message.role === MessageRole.USER) {
      return processUserMessage(message, {
        getRootUserMessageId,
        emittedUserRootIds,
        latestUserAttemptByRootId,
      });
    }

    // 处理助手消息
    if (message.role === MessageRole.ASSISTANT && typeof message.reply_to_message_id === "number") {
      return processAssistantMessage(message, {
        getRootUserMessageId,
        emittedAssistantRootIds,
        assistantAnchorMessageIdByRootId,
        latestUserAttemptByRootId,
        latestAssistantAttemptByRootId,
      });
    }

    return [message];
  });
}

function processUserMessage(
  message: ChatMessageItem,
  deps: {
    getRootUserMessageId: (id: number) => number;
    emittedUserRootIds: Set<number>;
    latestUserAttemptByRootId: Map<number, ChatMessageItem>;
  },
): ChatMessageItem[] {
  const rootUserMessageId = deps.getRootUserMessageId(message.id);
  if (message.id !== rootUserMessageId || deps.emittedUserRootIds.has(rootUserMessageId)) {
    return [];
  }

  deps.emittedUserRootIds.add(rootUserMessageId);
  const latestUserAttempt = deps.latestUserAttemptByRootId.get(rootUserMessageId) ?? message;
  return [latestUserAttempt];
}

function processAssistantMessage(
  message: ChatMessageItem,
  deps: {
    getRootUserMessageId: (id: number) => number;
    emittedAssistantRootIds: Set<number>;
    assistantAnchorMessageIdByRootId: Map<number, number>;
    latestUserAttemptByRootId: Map<number, ChatMessageItem>;
    latestAssistantAttemptByRootId: Map<number, ChatMessageItem>;
  },
): ChatMessageItem[] {
  const rootUserMessageId = deps.getRootUserMessageId(message.reply_to_message_id!);

  // 检查是否已发射
  if (deps.emittedAssistantRootIds.has(rootUserMessageId)) {
    return [];
  }

  // 检查是否是锚点消息
  if (deps.assistantAnchorMessageIdByRootId.get(rootUserMessageId) !== message.id) {
    return [];
  }

  const latestUserAttempt = deps.latestUserAttemptByRootId.get(rootUserMessageId);
  const latestAssistantAttempt =
    deps.latestAssistantAttemptByRootId.get(rootUserMessageId) ?? message;

  // 检查是否需要抑制失败的占位符
  if (shouldSuppressFailedAssistantPlaceholder(latestAssistantAttempt, latestUserAttempt)) {
    deps.emittedAssistantRootIds.add(rootUserMessageId);
    return [];
  }

  deps.emittedAssistantRootIds.add(rootUserMessageId);
  return [latestAssistantAttempt];
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
  const streamingRuns = sortBy(
    Object.values(runsById).filter((run) => run.sessionId === activeSessionId),
    [(run) => run.assistantMessageId],
  );

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

  if (activeSessionId === null || streamingRuns.length === 0) {
    return collapsedPersistedMessages;
  }

  const mergedMessages = mergeStreamingRuns(
    normalizedMessages,
    streamingRuns,
    maxPersistedMessageId,
  );

  return collapseRetryMessageAttempts(mergedMessages);
}

function mergeStreamingRuns(
  messages: ChatMessageItem[],
  streamingRuns: StreamingRun[],
  maxPersistedMessageId: number,
) {
  const nextMessages = [...messages];
  const messageIndexById = new Map(nextMessages.map((message, index) => [message.id, index]));

  for (const run of streamingRuns) {
    if (shouldSkipStreamingRun(run, maxPersistedMessageId)) {
      continue;
    }

    const existingIndex = messageIndexById.get(run.assistantMessageId) ?? -1;

    if (existingIndex >= 0) {
      const existingMessage = nextMessages[existingIndex]!;
      if (shouldKeepPersistedState(existingMessage, run)) {
        continue;
      }

      nextMessages[existingIndex] = mergeRunIntoMessage(existingMessage, run);
      continue;
    }

    nextMessages.push(createMessageFromRun(run));
    messageIndexById.set(run.assistantMessageId, nextMessages.length - 1);
  }

  return nextMessages;
}

function shouldSkipStreamingRun(run: StreamingRun, maxPersistedMessageId: number) {
  return isStreamingStatus(run.status) && run.assistantMessageId < maxPersistedMessageId;
}

function shouldKeepPersistedState(message: ChatMessageItem, run: StreamingRun) {
  const hasPersistedTerminalAssistantState =
    message.role === MessageRole.ASSISTANT && !isStreamingStatus(message.status);
  return hasPersistedTerminalAssistantState && run.status !== MessageStatus.SUCCEEDED;
}

function mergeRunIntoMessage(message: ChatMessageItem, run: StreamingRun) {
  return {
    ...message,
    content: run.content || message.content,
    reply_to_message_id: run.retryOfMessageId ?? run.userMessageId ?? message.reply_to_message_id,
    ...(run.errorMessage ? { error_message: run.errorMessage } : {}),
    sources_json:
      (run.sources ?? []).length > 0
        ? (run.sources as ChatMessageItem["sources_json"])
        : message.sources_json,
    status: run.status,
  };
}

function createMessageFromRun(run: StreamingRun) {
  return {
    id: run.assistantMessageId,
    role: MessageRole.ASSISTANT,
    content: run.content,
    reply_to_message_id: run.retryOfMessageId ?? run.userMessageId,
    ...(run.errorMessage ? { error_message: run.errorMessage } : {}),
    status: run.status,
    sources_json: (run.sources ?? []) as ChatMessageItem["sources_json"],
  } satisfies ChatMessageItem;
}
