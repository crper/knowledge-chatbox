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
import { Virtuoso, type FollowOutput, type VirtuosoHandle } from "react-virtuoso";

import { useIsMobile } from "@/lib/hooks/use-mobile";
import type { ChatMessageItem } from "../api/chat";
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

const ChatViewportScroller = forwardRef<HTMLDivElement, ComponentProps<"div">>(
  function ChatViewportScroller({ ...props }, ref) {
    return <div data-scroll-padding="comfortable" ref={ref} {...props} />;
  },
);

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
  const isMobile = useIsMobile();
  const virtuosoRef = useRef<VirtuosoHandle | null>(null);
  const previousLatestMessageSignatureRef = useRef<string>("empty");
  const previousScrollRequestKeyRef = useRef(scrollToLatestRequestKey);
  const previousMessagesLengthRef = useRef(messages.length);
  const pendingScrollToLatestRef = useRef(false);
  const pendingPrependScrollHeightRef = useRef<number | null>(null);
  const olderLoadTriggerArmedRef = useRef(true);
  const [scrollElement, setScrollElement] = useState<HTMLElement | null>(null);
  const latestMessage = messages.at(-1) ?? null;
  const initialPositionProps =
    messages.length > INITIAL_MESSAGE_ITEM_COUNT
      ? { initialTopMostItemIndex: messages.length - 1 }
      : {};
  const latestMessageSignature = useMemo(
    () =>
      latestMessage === null
        ? "empty"
        : `${latestMessage.id}:${latestMessage.status}:${latestMessage.content}`,
    [latestMessage],
  );

  const scrollToLatest = useCallback(
    (behavior: "auto" | "smooth" = "auto") => {
      if (messages.length === 0) {
        return;
      }

      virtuosoRef.current?.scrollToIndex({
        index: messages.length - 1,
        align: "end",
        behavior,
      });
    },
    [messages.length],
  );

  const followOutput: FollowOutput = useCallback((atBottom: boolean) => {
    return atBottom ? "auto" : false;
  }, []);

  useEffect(() => {
    if (previousScrollRequestKeyRef.current === scrollToLatestRequestKey) {
      return;
    }

    previousScrollRequestKeyRef.current = scrollToLatestRequestKey;
    pendingScrollToLatestRef.current = true;
  }, [scrollToLatestRequestKey]);

  useEffect(() => {
    if (messages.length === 0) {
      previousLatestMessageSignatureRef.current = "empty";
      pendingScrollToLatestRef.current = false;
      return;
    }

    if (previousLatestMessageSignatureRef.current === latestMessageSignature) {
      return;
    }

    const previousSignature = previousLatestMessageSignatureRef.current;
    previousLatestMessageSignatureRef.current = latestMessageSignature;

    if (pendingScrollToLatestRef.current) {
      pendingScrollToLatestRef.current = false;
      scrollToLatest("auto");
      return;
    }

    if (previousSignature === "empty") {
      return;
    }
  }, [latestMessageSignature, messages.length, scrollToLatest]);

  useEffect(() => {
    if (!scrollElement) {
      return;
    }

    const handleScroll = () => {
      const nextIsAtBottom = isNearBottom(scrollElement);
      if (!nextIsAtBottom) {
        pendingScrollToLatestRef.current = false;
      }

      if (scrollElement.scrollTop > TOP_THRESHOLD) {
        olderLoadTriggerArmedRef.current = true;
        return;
      }

      if (
        scrollElement.scrollTop <= TOP_THRESHOLD &&
        hasOlderMessages &&
        !isLoadingOlderMessages &&
        olderLoadTriggerArmedRef.current
      ) {
        olderLoadTriggerArmedRef.current = false;
        pendingPrependScrollHeightRef.current = scrollElement.scrollHeight;
        void onLoadOlderMessages?.();
      }
    };

    handleScroll();
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

    if (pendingPrependScrollHeightRef.current === null || isLoadingOlderMessages) {
      return;
    }

    if (messages.length <= previousMessagesLength) {
      pendingPrependScrollHeightRef.current = null;
      return;
    }

    const previousScrollHeight = pendingPrependScrollHeightRef.current;
    const nextScrollHeight = scrollElement.scrollHeight;
    const delta = nextScrollHeight - previousScrollHeight;
    if (delta > 0) {
      scrollElement.scrollTop += delta;
    }
    pendingPrependScrollHeightRef.current = null;
  }, [isLoadingOlderMessages, messages.length, scrollElement]);

  return (
    <div className="relative flex min-h-0 flex-1 flex-col" data-testid="chat-message-viewport-root">
      <Virtuoso
        alignToBottom={true}
        atBottomThreshold={BOTTOM_THRESHOLD}
        className="min-h-0 flex-1 px-2 pr-4 pb-4 sm:px-3 sm:pr-5 sm:pb-5 [scrollbar-gutter:stable_both-edges]"
        components={{ Scroller: ChatViewportScroller }}
        computeItemKey={(index, message) => message?.id ?? `probe-message-${index}`}
        data={messages}
        data-testid="chat-message-viewport-scroll"
        defaultItemHeight={DEFAULT_ITEM_HEIGHT}
        followOutput={followOutput}
        initialItemCount={Math.min(messages.length, INITIAL_MESSAGE_ITEM_COUNT)}
        itemContent={(_index, message) =>
          message ? (
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
          )
        }
        overscan={{ main: 720, reverse: 360 }}
        ref={virtuosoRef}
        startReached={() => {
          if (hasOlderMessages && !isLoadingOlderMessages) {
            pendingPrependScrollHeightRef.current = scrollElement?.scrollHeight ?? null;
            olderLoadTriggerArmedRef.current = false;
            void onLoadOlderMessages?.();
          }
        }}
        scrollerRef={(element) => {
          setScrollElement(element instanceof HTMLElement ? element : null);
        }}
        {...initialPositionProps}
      />
    </div>
  );
});
