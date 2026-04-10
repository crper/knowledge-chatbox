/**
 * @file 聊天消息视口组件。
 */

import {
  forwardRef,
  memo,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ComponentProps,
} from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { useTranslation } from "react-i18next";
import { ChevronDownIcon } from "lucide-react";

import { useIsMobile } from "@/lib/hooks/use-mobile";
import type { ChatMessageItem } from "../api/chat";
import {
  buildLatestMessageSignature,
  resolveLatestMessageScrollIntent,
  resolveOlderMessagesLoadIntent,
  resolvePrependCompensation,
} from "./chat-message-viewport-intent";
import { MessageRow } from "./message-list";

type ChatMessageViewportProps = {
  hasOlderMessages?: boolean;
  isLoadingOlderMessages?: boolean;
  messages: ChatMessageItem[];
  onLoadOlderMessages?: () => void | Promise<void>;
  onDeleteFailed?: (message: ChatMessageItem) => void;
  onEditFailed?: (message: ChatMessageItem) => void;
  onRetry: (message: ChatMessageItem) => void | Promise<void>;
  scrollToLatestRequestKey?: number;
};

const DEFAULT_ITEM_HEIGHT = 220;
const BOTTOM_THRESHOLD = 120;
const INITIAL_MESSAGE_ITEM_COUNT = 12;
const TOP_THRESHOLD = 80;

const ChatViewportList = forwardRef<
  HTMLDivElement,
  { "data-testid"?: string } & Omit<ComponentProps<"div">, "data-testid">
>(function ChatViewportList({ children, "data-testid": testId }, ref) {
  return (
    <div data-chat-viewport-list="bounded" data-testid={testId} ref={ref}>
      {children}
    </div>
  );
});

function renderProbeMessageRow() {
  return <div aria-hidden="true" className="h-[220px] opacity-0 pointer-events-none" />;
}

function isNearBottom(element: HTMLElement | null) {
  if (!element) {
    return true;
  }

  return element.scrollHeight - (element.scrollTop + element.clientHeight) <= BOTTOM_THRESHOLD;
}

/**
 * 渲染聊天消息虚拟视口。
 */
export const ChatMessageViewport = memo(function ChatMessageViewport({
  hasOlderMessages = false,
  isLoadingOlderMessages = false,
  messages,
  onLoadOlderMessages,
  onDeleteFailed,
  onEditFailed,
  onRetry,
  scrollToLatestRequestKey = 0,
}: ChatMessageViewportProps) {
  const { t } = useTranslation("chat");
  const isMobile = useIsMobile();
  const parentRef = useRef<HTMLDivElement>(null);
  const previousLatestMessageSignatureRef = useRef<string>("empty");
  const previousScrollRequestKeyRef = useRef(scrollToLatestRequestKey);
  const previousMessagesLengthRef = useRef(messages.length);
  const pendingScrollToLatestRef = useRef(false);
  const pendingPrependScrollHeightRef = useRef<number | null>(null);
  const olderLoadTriggerArmedRef = useRef(true);
  const initialPositionHandledRef = useRef(false);
  const [scrollElement, setScrollElement] = useState<HTMLElement | null>(null);
  const [hasNewMessage, setHasNewMessage] = useState(false);
  const latestMessage = messages.at(-1) ?? null;
  const latestMessageSignature = useMemo(
    () => buildLatestMessageSignature(latestMessage),
    [latestMessage],
  );

  const virtualizer = useVirtualizer({
    count: messages.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => DEFAULT_ITEM_HEIGHT,
    overscan: 5,
  });

  const scrollToLatest = useCallback(
    (behavior: "auto" | "smooth" = "auto") => {
      if (messages.length === 0) {
        return;
      }

      virtualizer.scrollToIndex(messages.length - 1, { align: "end", behavior });
    },
    [messages.length, virtualizer],
  );

  const handleNewMessageBannerClick = useCallback(() => {
    setHasNewMessage(false);
    scrollToLatest("smooth");
  }, [scrollToLatest]);

  useEffect(() => {
    if (previousScrollRequestKeyRef.current === scrollToLatestRequestKey) {
      return;
    }

    previousScrollRequestKeyRef.current = scrollToLatestRequestKey;
    pendingScrollToLatestRef.current = true;
  }, [scrollToLatestRequestKey]);

  useEffect(() => {
    const intent = resolveLatestMessageScrollIntent({
      isNearBottom: isNearBottom(scrollElement),
      latestMessageSignature,
      pendingScrollToLatest: pendingScrollToLatestRef.current,
      previousLatestMessageSignature: previousLatestMessageSignatureRef.current,
    });
    previousLatestMessageSignatureRef.current = intent.nextPreviousLatestMessageSignature;
    pendingScrollToLatestRef.current = intent.nextPendingScrollToLatest;

    if (intent.shouldIndicateNewMessage) {
      setHasNewMessage(true);
    }

    if (intent.shouldScrollToLatest) {
      setHasNewMessage(false);
      scrollToLatest("auto");
    }
  }, [latestMessageSignature, scrollToLatest, scrollElement]);

  useEffect(() => {
    if (!scrollElement) {
      return;
    }

    const handleScroll = () => {
      if (isNearBottom(scrollElement)) {
        setHasNewMessage(false);
      }

      const intent = resolveOlderMessagesLoadIntent({
        hasOlderMessages,
        isLoadingOlderMessages,
        isNearBottom: isNearBottom(scrollElement),
        olderLoadTriggerArmed: olderLoadTriggerArmedRef.current,
        pendingPrependScrollHeight: pendingPrependScrollHeightRef.current,
        scrollHeight: scrollElement.scrollHeight,
        scrollTop: scrollElement.scrollTop,
        topThreshold: TOP_THRESHOLD,
      });

      if (intent.shouldClearPendingScroll) {
        pendingScrollToLatestRef.current = false;
      }
      olderLoadTriggerArmedRef.current = intent.nextOlderLoadTriggerArmed;
      pendingPrependScrollHeightRef.current = intent.nextPendingPrependScrollHeight;

      if (intent.shouldLoadOlderMessages) {
        void onLoadOlderMessages?.();
      }
    };

    scrollElement.addEventListener("scroll", handleScroll, { passive: true });

    return () => {
      scrollElement.removeEventListener("scroll", handleScroll);
    };
  }, [hasOlderMessages, isLoadingOlderMessages, onLoadOlderMessages, scrollElement]);

  useEffect(() => {
    if (!scrollElement) {
      previousMessagesLengthRef.current = messages.length;
      return;
    }

    const previousMessagesLength = previousMessagesLengthRef.current;
    previousMessagesLengthRef.current = messages.length;
    const compensation = resolvePrependCompensation({
      isLoadingOlderMessages,
      nextMessagesLength: messages.length,
      nextScrollHeight: scrollElement.scrollHeight,
      pendingPrependScrollHeight: pendingPrependScrollHeightRef.current,
      previousMessagesLength,
    });
    pendingPrependScrollHeightRef.current = compensation.nextPendingPrependScrollHeight;

    if ((compensation.scrollDelta ?? 0) > 0) {
      scrollElement.scrollTop += compensation.scrollDelta ?? 0;
    }
  }, [isLoadingOlderMessages, messages.length, scrollElement]);

  useEffect(() => {
    const element = parentRef.current;
    if (!element) {
      return;
    }

    setScrollElement(element instanceof HTMLElement ? element : null);

    return () => {
      setScrollElement(null);
    };
  }, []);

  useEffect(() => {
    if (messages.length === 0 || initialPositionHandledRef.current) {
      return;
    }

    initialPositionHandledRef.current = true;

    if (messages.length > INITIAL_MESSAGE_ITEM_COUNT) {
      scrollToLatest("auto");
    }
  }, [messages.length, scrollToLatest]);

  return (
    <div className="relative flex min-h-0 flex-1 flex-col" data-testid="chat-message-viewport-root">
      <div
        ref={parentRef}
        className="min-h-0 flex-1 overflow-x-hidden overflow-y-auto px-2 pr-4 pb-4 sm:px-3 sm:pr-5 sm:pb-5 [scrollbar-gutter:stable_both-edges]"
        data-testid="chat-message-viewport-scroll"
        data-scroll-padding="comfortable"
        style={{ contain: "strict" }}
      >
        <ChatViewportList data-testid="chat-message-virtual-list">
          <div
            style={{
              height: `${virtualizer.getTotalSize()}px`,
              width: "100%",
              position: "relative",
            }}
          >
            {virtualizer.getVirtualItems().map((virtualItem) => {
              const message = messages[virtualItem.index];
              return (
                <div
                  key={message?.id ?? `probe-message-${virtualItem.index}`}
                  data-index={virtualItem.index}
                  ref={virtualizer.measureElement}
                  style={{
                    position: "absolute",
                    top: 0,
                    left: 0,
                    width: "100%",
                    transform: `translateY(${virtualItem.start}px)`,
                  }}
                >
                  {message ? (
                    <div
                      className="page-content-rail mx-auto px-3 py-3 sm:px-4 md:px-5"
                      data-message-rail="comfortable"
                      data-testid="chat-message-virtual-item"
                    >
                      <MessageRow
                        isCompactLayout={isMobile}
                        message={message}
                        onDeleteFailed={onDeleteFailed}
                        onEditFailed={onEditFailed}
                        onRetry={onRetry}
                      />
                    </div>
                  ) : (
                    renderProbeMessageRow()
                  )}
                </div>
              );
            })}
          </div>
        </ChatViewportList>
      </div>

      {hasNewMessage && (
        <div className="absolute bottom-3 left-1/2 -translate-x-1/2 z-10 animate-fade-in-up">
          <button
            className="flex items-center gap-1.5 rounded-full border border-border/40 bg-background/90 px-3 py-1.5 text-xs font-medium text-foreground shadow-md backdrop-blur-sm transition-colors hover:bg-background hover:border-border/60"
            data-testid="new-message-banner"
            onClick={handleNewMessageBannerClick}
            type="button"
          >
            <ChevronDownIcon aria-hidden="true" className="size-3.5" />
            {t("newMessagesBanner")}
          </button>
        </div>
      )}
    </div>
  );
});
