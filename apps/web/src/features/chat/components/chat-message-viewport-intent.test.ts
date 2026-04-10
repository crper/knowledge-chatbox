import {
  buildLatestMessageSignature,
  resolveLatestMessageScrollIntent,
  resolveOlderMessagesLoadIntent,
  resolvePrependCompensation,
} from "./chat-message-viewport-intent";

describe("chat-message-viewport-intent", () => {
  it("builds a stable latest message signature", () => {
    expect(
      buildLatestMessageSignature({
        id: 7,
        status: "streaming",
        content: "hello",
      }),
    ).toBe("7:streaming:hello");
    expect(buildLatestMessageSignature(null)).toBe("empty");
  });

  it("requests scroll-to-latest when a pending explicit scroll waits for a new message", () => {
    expect(
      resolveLatestMessageScrollIntent({
        isNearBottom: false,
        latestMessageSignature: "8:succeeded:done",
        pendingScrollToLatest: true,
        previousLatestMessageSignature: "7:streaming:hi",
      }),
    ).toMatchObject({
      nextPendingScrollToLatest: false,
      nextPreviousLatestMessageSignature: "8:succeeded:done",
      shouldIndicateNewMessage: false,
      shouldScrollToLatest: true,
    });
  });

  it("does not auto-scroll on the first message render when there was no prior signature", () => {
    expect(
      resolveLatestMessageScrollIntent({
        isNearBottom: true,
        latestMessageSignature: "1:succeeded:first",
        pendingScrollToLatest: false,
        previousLatestMessageSignature: "empty",
      }),
    ).toMatchObject({
      nextPendingScrollToLatest: false,
      nextPreviousLatestMessageSignature: "1:succeeded:first",
      shouldIndicateNewMessage: false,
      shouldScrollToLatest: false,
    });
  });

  it("indicates new message when user is not near bottom and a new message arrives", () => {
    expect(
      resolveLatestMessageScrollIntent({
        isNearBottom: false,
        latestMessageSignature: "8:succeeded:done",
        pendingScrollToLatest: false,
        previousLatestMessageSignature: "7:streaming:hi",
      }),
    ).toMatchObject({
      nextPendingScrollToLatest: false,
      nextPreviousLatestMessageSignature: "8:succeeded:done",
      shouldIndicateNewMessage: true,
      shouldScrollToLatest: false,
    });
  });

  it("auto-scrolls without banner when user is near bottom and a new message arrives", () => {
    expect(
      resolveLatestMessageScrollIntent({
        isNearBottom: true,
        latestMessageSignature: "8:succeeded:done",
        pendingScrollToLatest: false,
        previousLatestMessageSignature: "7:streaming:hi",
      }),
    ).toMatchObject({
      nextPendingScrollToLatest: false,
      nextPreviousLatestMessageSignature: "8:succeeded:done",
      shouldIndicateNewMessage: false,
      shouldScrollToLatest: true,
    });
  });

  it("does not indicate new message when signature has not changed", () => {
    expect(
      resolveLatestMessageScrollIntent({
        isNearBottom: false,
        latestMessageSignature: "7:streaming:hi",
        pendingScrollToLatest: false,
        previousLatestMessageSignature: "7:streaming:hi",
      }),
    ).toMatchObject({
      shouldIndicateNewMessage: false,
      shouldScrollToLatest: false,
    });
  });

  it("does not indicate new message when messages are empty", () => {
    expect(
      resolveLatestMessageScrollIntent({
        isNearBottom: false,
        latestMessageSignature: "empty",
        pendingScrollToLatest: false,
        previousLatestMessageSignature: "7:streaming:hi",
      }),
    ).toMatchObject({
      shouldIndicateNewMessage: false,
      shouldScrollToLatest: false,
    });
  });

  it("arms older-message loading only after the reader leaves the top threshold", () => {
    expect(
      resolveOlderMessagesLoadIntent({
        hasOlderMessages: true,
        isLoadingOlderMessages: false,
        isNearBottom: false,
        olderLoadTriggerArmed: true,
        pendingPrependScrollHeight: null,
        scrollHeight: 4000,
        scrollTop: 40,
        topThreshold: 80,
      }),
    ).toMatchObject({
      nextOlderLoadTriggerArmed: false,
      nextPendingPrependScrollHeight: 4000,
      shouldClearPendingScroll: true,
      shouldLoadOlderMessages: true,
    });

    expect(
      resolveOlderMessagesLoadIntent({
        hasOlderMessages: true,
        isLoadingOlderMessages: false,
        isNearBottom: true,
        olderLoadTriggerArmed: false,
        pendingPrependScrollHeight: null,
        scrollHeight: 4000,
        scrollTop: 140,
        topThreshold: 80,
      }),
    ).toMatchObject({
      nextOlderLoadTriggerArmed: true,
      shouldLoadOlderMessages: false,
    });
  });

  it("computes prepend compensation only when older messages actually arrived", () => {
    expect(
      resolvePrependCompensation({
        isLoadingOlderMessages: false,
        nextMessagesLength: 12,
        nextScrollHeight: 5100,
        pendingPrependScrollHeight: 4700,
        previousMessagesLength: 10,
      }),
    ).toMatchObject({
      nextPendingPrependScrollHeight: null,
      scrollDelta: 400,
    });

    expect(
      resolvePrependCompensation({
        isLoadingOlderMessages: true,
        nextMessagesLength: 12,
        nextScrollHeight: 5100,
        pendingPrependScrollHeight: 4700,
        previousMessagesLength: 10,
      }),
    ).toMatchObject({
      nextPendingPrependScrollHeight: 4700,
      scrollDelta: null,
    });
  });
});
