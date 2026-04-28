/**
 * @file 聊天消息展示构建模块。
 *
 * 负责将持久化消息与流式运行状态合并为最终展示给用户的消息列表。
 * 核心流程：持久化消息 → 流式运行合并 → 重试折叠 → 最终展示列表。
 */

import { sortBy } from "es-toolkit";

import type { ChatMessageItem } from "../api/chat";
import {
  joinStreamingRunContent,
  normalizeStreamingRun,
  type StreamingRun,
  type StreamingRunLike,
} from "./streaming-run";
import { MessageRole, MessageStatus, isStreamingStatus } from "../constants";

/**
 * 修正持久化消息中的"幽灵流式状态"。
 *
 * 当后端返回的助手消息仍标记为 streaming 状态，但该流式运行已不在活跃列表中
 * （例如页面刷新后丢失了运行时状态），将其降级为 failed，避免界面永远显示加载中。
 */
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

/**
 * 沿 retry_of_message_id 链回溯，找到重试链的根用户消息 ID。
 *
 * 用户可能对同一条消息多次重试，形成链式关系：
 * user_msg_1 (retry_of=null) → user_msg_2 (retry_of=1) → user_msg_3 (retry_of=2)
 * 此函数返回链头（user_msg_1 的 ID），用于将重试消息折叠到同一组。
 */
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

/**
 * 判断是否应隐藏失败的空助手消息占位符。
 *
 * 当用户重试后，旧的失败助手消息如果内容为空，就不需要展示了，
 * 避免在重试链中出现多余的空白失败气泡。
 */
function shouldSuppressFailedAssistantPlaceholder(
  assistantMessage: ChatMessageItem,
  latestUserAttempt: ChatMessageItem | undefined,
): boolean {
  if (latestUserAttempt?.status !== MessageStatus.FAILED) return false;
  if (assistantMessage.status !== MessageStatus.FAILED) return false;
  return assistantMessage.content.trim().length === 0;
}

/**
 * 折叠重试消息：同一重试链中只保留最新一次尝试的用户消息和助手消息。
 *
 * 折叠策略：
 * - 用户消息：只保留链头位置，显示最新一次尝试的内容
 * - 助手消息：只在链头对应的锚点位置显示，使用最新一次尝试的内容
 * - 空内容的失败助手占位符被隐藏
 */
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

  // 第一遍扫描：建立重试链索引
  messages.forEach((message) => {
    if (message.role === MessageRole.USER) {
      const rootUserMessageId = getRootUserMessageId(message.id);
      latestUserAttemptByRootId.set(rootUserMessageId, message);
      return;
    }

    if (message.role === MessageRole.ASSISTANT && typeof message.reply_to_message_id === "number") {
      const rootUserMessageId = getRootUserMessageId(message.reply_to_message_id);
      latestAssistantAttemptByRootId.set(rootUserMessageId, message);
      // 锚点：重试链中第一个助手消息的位置，折叠后的助手消息将显示在此位置
      if (!assistantAnchorMessageIdByRootId.has(rootUserMessageId)) {
        assistantAnchorMessageIdByRootId.set(rootUserMessageId, message.id);
      }
    }
  });

  const emittedUserRootIds = new Set<number>();
  const emittedAssistantRootIds = new Set<number>();

  // 第二遍扫描：按原始顺序输出，折叠重复的重试消息
  return messages.flatMap((message) => {
    if (message.role === MessageRole.USER) {
      return processUserMessage(message, {
        getRootUserMessageId,
        emittedUserRootIds,
        latestUserAttemptByRootId,
      });
    }

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

type UserMessageDeps = {
  getRootUserMessageId: (id: number) => number;
  emittedUserRootIds: Set<number>;
  latestUserAttemptByRootId: Map<number, ChatMessageItem>;
};

function processUserMessage(message: ChatMessageItem, deps: UserMessageDeps): ChatMessageItem[] {
  const rootUserMessageId = deps.getRootUserMessageId(message.id);
  // 非链头消息或已输出过该链的用户消息，跳过
  if (message.id !== rootUserMessageId || deps.emittedUserRootIds.has(rootUserMessageId)) {
    return [];
  }

  deps.emittedUserRootIds.add(rootUserMessageId);
  // 显示最新一次尝试的用户消息内容
  const latestUserAttempt = deps.latestUserAttemptByRootId.get(rootUserMessageId) ?? message;
  return [latestUserAttempt];
}

type AssistantMessageDeps = {
  getRootUserMessageId: (id: number) => number;
  emittedAssistantRootIds: Set<number>;
  assistantAnchorMessageIdByRootId: Map<number, number>;
  latestUserAttemptByRootId: Map<number, ChatMessageItem>;
  latestAssistantAttemptByRootId: Map<number, ChatMessageItem>;
};

function processAssistantMessage(
  message: ChatMessageItem,
  deps: AssistantMessageDeps,
): ChatMessageItem[] {
  const rootUserMessageId = deps.getRootUserMessageId(message.reply_to_message_id!);

  // 已输出过该链的助手消息，跳过
  if (deps.emittedAssistantRootIds.has(rootUserMessageId)) {
    return [];
  }

  // 只在锚点位置输出，避免重试链中多个助手消息同时出现
  if (deps.assistantAnchorMessageIdByRootId.get(rootUserMessageId) !== message.id) {
    return [];
  }

  const latestUserAttempt = deps.latestUserAttemptByRootId.get(rootUserMessageId);
  const latestAssistantAttempt =
    deps.latestAssistantAttemptByRootId.get(rootUserMessageId) ?? message;

  // 隐藏空内容的失败助手占位符
  if (shouldSuppressFailedAssistantPlaceholder(latestAssistantAttempt, latestUserAttempt)) {
    deps.emittedAssistantRootIds.add(rootUserMessageId);
    return [];
  }

  deps.emittedAssistantRootIds.add(rootUserMessageId);
  return [latestAssistantAttempt];
}

/**
 * 构建最终展示给用户的消息列表。
 *
 * 合并流程：
 * 1. 过滤并排序当前会话的流式运行
 * 2. 修正持久化消息中的幽灵流式状态
 * 3. 将流式运行合并到持久化消息中
 * 4. 折叠重试消息链
 */
export function buildDisplayMessages({
  activeSessionId,
  messages,
  runsById,
}: {
  activeSessionId: number | null;
  messages: ChatMessageItem[];
  runsById: Record<number, StreamingRunLike>;
}) {
  const allStreamingRuns = sortBy(
    Object.values(runsById)
      .map((run) => normalizeStreamingRun(run))
      .filter((run) => run.sessionId === activeSessionId),
    [(run) => run.assistantMessageId],
  );

  const maxPersistedMessageId = messages[messages.length - 1]?.id ?? 0;

  const persistedMessageIds = new Set(messages.map((message) => message.id));

  // 过滤已持久化的成功运行，避免重复显示
  const streamingRuns = allStreamingRuns.filter((run) => {
    if (run.status === MessageStatus.SUCCEEDED && !run.suppressPersistedAssistantMessage) {
      return !persistedMessageIds.has(run.assistantMessageId);
    }
    return true;
  });

  const activeStreamingAssistantMessageIds = new Set(
    streamingRuns
      .filter((run) => isStreamingStatus(run.status))
      .map((run) => run.assistantMessageId),
  );

  const normalizedMessages = normalizePersistedMessages(
    messages,
    activeStreamingAssistantMessageIds,
    maxPersistedMessageId,
  );
  if (activeSessionId === null || streamingRuns.length === 0) {
    return collapseRetryMessageAttempts(normalizedMessages);
  }

  const mergedMessages = mergeStreamingRuns(
    normalizedMessages,
    streamingRuns,
    maxPersistedMessageId,
  );

  return collapseRetryMessageAttempts(mergedMessages);
}

/**
 * 将流式运行合并到持久化消息列表中。
 *
 * 对于每条流式运行：
 * - 如果对应 ID 的助手消息已存在于持久化列表中，原地更新其内容和状态
 * - 如果不存在，追加到列表末尾
 * - 跳过 ID 小于最大持久化消息 ID 的流式运行（避免复活旧消息）
 */
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

/** 跳过 ID 过小的流式运行：这些运行对应的消息已被更新的持久化消息取代。 */
function shouldSkipStreamingRun(run: StreamingRun, maxPersistedMessageId: number) {
  return isStreamingStatus(run.status) && run.assistantMessageId < maxPersistedMessageId;
}

/**
 * 判断是否应保留持久化消息的当前状态，不被流式运行覆盖。
 *
 * 保留条件：
 * - 流式运行标记 suppressPersistedAssistantMessage 且持久化消息已成功 → 保留持久化
 * - 持久化消息已有终态（非流式）且流式运行未成功 → 保留持久化
 */
function shouldKeepPersistedState(message: ChatMessageItem, run: StreamingRun) {
  if (
    run.suppressPersistedAssistantMessage &&
    message.role === MessageRole.ASSISTANT &&
    message.status === MessageStatus.SUCCEEDED
  ) {
    return true;
  }
  if (run.suppressPersistedAssistantMessage) {
    return false;
  }
  const hasPersistedTerminalAssistantState =
    message.role === MessageRole.ASSISTANT && !isStreamingStatus(message.status);
  return hasPersistedTerminalAssistantState && run.status !== MessageStatus.SUCCEEDED;
}

/** 将流式运行的内容、状态、来源合并到已有的持久化消息中。 */
function mergeRunIntoMessage(message: ChatMessageItem, run: StreamingRun) {
  const runContent = joinStreamingRunContent(run.content);
  return {
    ...message,
    content: runContent || message.content,
    reply_to_message_id: run.retryOfMessageId ?? run.userMessageId ?? message.reply_to_message_id,
    ...(run.errorMessage ? { error_message: run.errorMessage } : {}),
    sources: (run.sources ?? []).length > 0 ? run.sources : message.sources,
    status: run.status,
  };
}

/** 从流式运行创建新的展示消息（用于尚未持久化的运行）。 */
function createMessageFromRun(run: StreamingRun) {
  const runContent = joinStreamingRunContent(run.content);
  return {
    id: run.assistantMessageId,
    role: MessageRole.ASSISTANT,
    content: runContent,
    reply_to_message_id: run.retryOfMessageId ?? run.userMessageId,
    ...(run.errorMessage ? { error_message: run.errorMessage } : {}),
    status: run.status,
    sources: run.sources ?? [],
  } satisfies ChatMessageItem;
}
