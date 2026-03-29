import { fireEvent, render, screen, waitFor } from "@testing-library/react";

import type { ChatMessageItem } from "@/features/chat/api/chat";
import { AppProviders } from "@/providers/app-providers";
import { ChatMessageViewport } from "./chat-message-viewport";

const scrollToIndexSpy = vi.fn();

vi.mock("react-virtuoso", async () => {
  const React = await import("react");

  const Virtuoso = React.forwardRef(function MockVirtuoso(
    {
      components,
      data = [],
      initialItemCount,
      itemContent,
      startReached,
      scrollerRef,
      "data-testid": testId,
    }: {
      components?: { Scroller?: React.ComponentType<React.ComponentProps<"div">> };
      data?: ChatMessageItem[];
      initialItemCount?: number;
      itemContent?: (index: number, item?: ChatMessageItem) => React.ReactNode;
      startReached?: () => void;
      scrollerRef?: (element: HTMLElement | null) => void;
      "data-testid"?: string;
    },
    ref: React.ForwardedRef<{ scrollToIndex: typeof scrollToIndexSpy }>,
  ) {
    const elementRef = React.useRef<HTMLDivElement | null>(null);

    React.useImperativeHandle(ref, () => ({
      scrollToIndex: scrollToIndexSpy,
    }));

    React.useEffect(() => {
      scrollerRef?.(elementRef.current);
      return () => {
        scrollerRef?.(null);
      };
    }, [scrollerRef]);

    const Scroller = components?.Scroller ?? "div";
    const renderCount = Math.max(data.length, initialItemCount ?? 0);
    const items = Array.from({ length: renderCount }, (_, index) =>
      itemContent?.(index, data[index]),
    );

    if (items.some((item) => item == null)) {
      throw new Error("Virtuoso received an empty message row.");
    }

    return (
      <Scroller data-testid={testId} ref={elementRef}>
        <button onClick={startReached} type="button">
          mock-load-older
        </button>
        {items.map((item, index) => (
          <div key={data[index]?.id ?? `probe-message-${index}`}>{item}</div>
        ))}
      </Scroller>
    );
  });

  return { Virtuoso };
});

function buildMessages(count: number): ChatMessageItem[] {
  return Array.from({ length: count }, (_, index) => ({
    id: index + 1,
    role: index % 2 === 0 ? "user" : "assistant",
    content: `message ${index + 1}`,
    status: "succeeded",
    sources_json: [],
  }));
}

function renderViewport(messages: ChatMessageItem[], scrollToLatestRequestKey = 0) {
  return render(
    <AppProviders>
      <div style={{ height: "640px" }}>
        <ChatMessageViewport
          messages={messages}
          onRetry={vi.fn()}
          scrollToLatestRequestKey={scrollToLatestRequestKey}
        />
      </div>
    </AppProviders>,
  );
}

describe("ChatMessageViewport", () => {
  beforeEach(() => {
    scrollToIndexSpy.mockClear();
  });

  it("keeps extra gutter and rail padding so the scrollbar does not sit on top of messages", async () => {
    renderViewport(buildMessages(12));

    expect(await screen.findByTestId("chat-message-viewport-scroll")).toHaveAttribute(
      "data-scroll-padding",
      "comfortable",
    );
    expect(screen.getAllByTestId("chat-message-virtual-item")[0]).toHaveAttribute(
      "data-message-rail",
      "comfortable",
    );
  });

  it("renders a short message list without producing empty probe rows", async () => {
    renderViewport(buildMessages(1));

    expect(await screen.findAllByTestId("chat-message-virtual-item")).toHaveLength(1);
  });

  it("scrolls to the latest message after a send-triggered request is followed by a new message", async () => {
    const view = renderViewport(buildMessages(80), 0);
    const scroller = await screen.findByTestId("chat-message-viewport-scroll");

    Object.defineProperty(scroller, "clientHeight", {
      configurable: true,
      value: 640,
    });
    Object.defineProperty(scroller, "scrollHeight", {
      configurable: true,
      value: 4000,
    });
    Object.defineProperty(scroller, "scrollTop", {
      configurable: true,
      writable: true,
      value: 3360,
    });

    fireEvent.scroll(scroller);

    view.rerender(
      <AppProviders>
        <div style={{ height: "640px" }}>
          <ChatMessageViewport
            messages={buildMessages(80)}
            onRetry={vi.fn()}
            scrollToLatestRequestKey={1}
          />
        </div>
      </AppProviders>,
    );

    expect(scrollToIndexSpy).not.toHaveBeenCalled();

    view.rerender(
      <AppProviders>
        <div style={{ height: "640px" }}>
          <ChatMessageViewport
            messages={buildMessages(81)}
            onRetry={vi.fn()}
            scrollToLatestRequestKey={1}
          />
        </div>
      </AppProviders>,
    );

    await waitFor(() => {
      expect(scrollToIndexSpy).toHaveBeenCalledWith({
        index: 80,
        align: "end",
        behavior: "auto",
      });
    });
  });

  it("cancels a pending send-triggered scroll when the reader scrolls away first", async () => {
    const view = renderViewport(buildMessages(80), 0);
    const scroller = await screen.findByTestId("chat-message-viewport-scroll");

    Object.defineProperty(scroller, "clientHeight", {
      configurable: true,
      value: 640,
    });
    Object.defineProperty(scroller, "scrollHeight", {
      configurable: true,
      value: 4000,
    });
    Object.defineProperty(scroller, "scrollTop", {
      configurable: true,
      writable: true,
      value: 3360,
    });

    fireEvent.scroll(scroller);

    view.rerender(
      <AppProviders>
        <div style={{ height: "640px" }}>
          <ChatMessageViewport
            messages={buildMessages(80)}
            onRetry={vi.fn()}
            scrollToLatestRequestKey={1}
          />
        </div>
      </AppProviders>,
    );

    scroller.scrollTop = 0;
    fireEvent.scroll(scroller);

    view.rerender(
      <AppProviders>
        <div style={{ height: "640px" }}>
          <ChatMessageViewport
            messages={buildMessages(81)}
            onRetry={vi.fn()}
            scrollToLatestRequestKey={1}
          />
        </div>
      </AppProviders>,
    );

    await waitFor(() => {
      expect(scrollToIndexSpy).not.toHaveBeenCalled();
    });
  });

  it("requests older messages when older history exists", async () => {
    const onLoadOlderMessages = vi.fn();

    render(
      <AppProviders>
        <div style={{ height: "640px" }}>
          <ChatMessageViewport
            hasOlderMessages={true}
            isLoadingOlderMessages={false}
            messages={buildMessages(80)}
            onLoadOlderMessages={onLoadOlderMessages}
            onRetry={vi.fn()}
          />
        </div>
      </AppProviders>,
    );

    fireEvent.click(await screen.findByRole("button", { name: "mock-load-older" }));

    expect(onLoadOlderMessages).toHaveBeenCalled();
  });
});
