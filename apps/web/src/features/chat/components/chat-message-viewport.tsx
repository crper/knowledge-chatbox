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
  messages: ChatMessageItem[];
  onDeleteFailed?: (message: ChatMessageItem) => void;
  onEditFailed?: (message: ChatMessageItem) => void;
  onRetry: (message: ChatMessageItem) => void | Promise<void>;
  scrollToLatestRequestKey?: number;
};

const DEFAULT_ITEM_HEIGHT = 220;
const BOTTOM_THRESHOLD = 120;
const INITIAL_MESSAGE_ITEM_COUNT = 12;

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
  messages,
  onDeleteFailed,
  onEditFailed,
  onRetry,
  scrollToLatestRequestKey = 0,
}: ChatMessageViewportProps) {
  const isMobile = useIsMobile();
  const virtuosoRef = useRef<VirtuosoHandle | null>(null);
  const previousLatestMessageSignatureRef = useRef<string>("empty");
  const previousScrollRequestKeyRef = useRef(scrollToLatestRequestKey);
  const pendingScrollToLatestRef = useRef(false);
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
    };

    handleScroll();
    scrollElement.addEventListener("scroll", handleScroll, { passive: true });

    return () => {
      scrollElement.removeEventListener("scroll", handleScroll);
    };
  }, [scrollElement]);

  return (
    <div className="relative h-full min-h-0">
      <Virtuoso
        alignToBottom={true}
        atBottomThreshold={BOTTOM_THRESHOLD}
        className="h-full min-h-0 px-2 pr-4 pb-4 sm:px-3 sm:pr-5 sm:pb-5 [scrollbar-gutter:stable_both-edges]"
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
        scrollerRef={(element) => {
          setScrollElement(element instanceof HTMLElement ? element : null);
        }}
        {...initialPositionProps}
      />
    </div>
  );
});
