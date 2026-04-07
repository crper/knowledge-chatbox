import type { ChatMessageItem } from "../api/chat";

type LatestMessageLike = Pick<ChatMessageItem, "content" | "id" | "status"> | null;

export function buildLatestMessageSignature(latestMessage: LatestMessageLike) {
  return latestMessage === null
    ? "empty"
    : `${latestMessage.id}:${latestMessage.status}:${latestMessage.content}`;
}

export function resolveLatestMessageScrollIntent({
  isNearBottom,
  latestMessageSignature,
  pendingScrollToLatest,
  previousLatestMessageSignature,
}: {
  isNearBottom: boolean;
  latestMessageSignature: string;
  pendingScrollToLatest: boolean;
  previousLatestMessageSignature: string;
}) {
  if (latestMessageSignature === "empty") {
    return {
      nextPendingScrollToLatest: false,
      nextPreviousLatestMessageSignature: "empty",
      shouldScrollToLatest: false,
    };
  }

  if (previousLatestMessageSignature === latestMessageSignature) {
    return {
      nextPendingScrollToLatest: pendingScrollToLatest,
      nextPreviousLatestMessageSignature: previousLatestMessageSignature,
      shouldScrollToLatest: false,
    };
  }

  if (pendingScrollToLatest) {
    return {
      nextPendingScrollToLatest: false,
      nextPreviousLatestMessageSignature: latestMessageSignature,
      shouldScrollToLatest: true,
    };
  }

  if (previousLatestMessageSignature === "empty") {
    return {
      nextPendingScrollToLatest: false,
      nextPreviousLatestMessageSignature: latestMessageSignature,
      shouldScrollToLatest: false,
    };
  }

  return {
    nextPendingScrollToLatest: pendingScrollToLatest,
    nextPreviousLatestMessageSignature: latestMessageSignature,
    shouldScrollToLatest: isNearBottom,
  };
}

export function resolveOlderMessagesLoadIntent({
  hasOlderMessages,
  isLoadingOlderMessages,
  isNearBottom,
  olderLoadTriggerArmed,
  pendingPrependScrollHeight,
  scrollHeight,
  scrollTop,
  topThreshold,
}: {
  hasOlderMessages: boolean;
  isLoadingOlderMessages: boolean;
  isNearBottom: boolean;
  olderLoadTriggerArmed: boolean;
  pendingPrependScrollHeight: number | null;
  scrollHeight: number;
  scrollTop: number;
  topThreshold: number;
}) {
  if (scrollTop > topThreshold) {
    return {
      nextOlderLoadTriggerArmed: true,
      nextPendingPrependScrollHeight: pendingPrependScrollHeight,
      shouldClearPendingScroll: !isNearBottom,
      shouldLoadOlderMessages: false,
    };
  }

  if (hasOlderMessages && !isLoadingOlderMessages && olderLoadTriggerArmed) {
    return {
      nextOlderLoadTriggerArmed: false,
      nextPendingPrependScrollHeight: scrollHeight,
      shouldClearPendingScroll: !isNearBottom,
      shouldLoadOlderMessages: true,
    };
  }

  return {
    nextOlderLoadTriggerArmed: olderLoadTriggerArmed,
    nextPendingPrependScrollHeight: pendingPrependScrollHeight,
    shouldClearPendingScroll: !isNearBottom,
    shouldLoadOlderMessages: false,
  };
}

export function resolvePrependCompensation({
  isLoadingOlderMessages,
  nextMessagesLength,
  nextScrollHeight,
  pendingPrependScrollHeight,
  previousMessagesLength,
}: {
  isLoadingOlderMessages: boolean;
  nextMessagesLength: number;
  nextScrollHeight: number;
  pendingPrependScrollHeight: number | null;
  previousMessagesLength: number;
}) {
  if (pendingPrependScrollHeight === null || isLoadingOlderMessages) {
    return {
      nextPendingPrependScrollHeight: pendingPrependScrollHeight,
      scrollDelta: null,
    };
  }

  if (nextMessagesLength <= previousMessagesLength) {
    return {
      nextPendingPrependScrollHeight: null,
      scrollDelta: null,
    };
  }

  return {
    nextPendingPrependScrollHeight: null,
    scrollDelta: nextScrollHeight - pendingPrependScrollHeight,
  };
}
