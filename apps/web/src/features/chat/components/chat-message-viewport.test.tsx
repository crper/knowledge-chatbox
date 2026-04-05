import { fireEvent, render, screen, waitFor } from "@testing-library/react";

import type { ChatMessageItem } from "@/features/chat/api/chat";
import { AppProviders } from "@/providers/app-providers";
import { ChatMessageViewport } from "./chat-message-viewport";

const scrollToIndexSpy = vi.fn();

vi.mock("@tanstack/react-virtual", async () => {
  const React = await import("react");

  return {
    useVirtualizer: vi.fn(
      (options: {
        count?: number;
        getScrollElement?: () => HTMLElement | null;
        estimateSize?: (index: number) => number;
        overscan?: number;
      }) => {
        const count = options.count ?? 0;
        const elementRef = React.useRef<HTMLDivElement | null>(null);

        React.useEffect(() => {
          const el = options.getScrollElement?.();
          if (el instanceof HTMLDivElement) {
            elementRef.current = el;
          }
        });

        return {
          getVirtualItems: () =>
            Array.from({ length: count }, (_, index) => ({
              index,
              start: index * 220,
              size: 220,
              key: index,
            })),
          getTotalSize: () => count * 220,
          scrollToIndex: scrollToIndexSpy,
        };
      },
    ),
  };
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

    expect(await screen.findByTestId("chat-message-viewport-root")).toHaveClass("flex-1");
    const scroller = await screen.findByTestId("chat-message-viewport-scroll");
    expect(scroller).toHaveAttribute("data-scroll-padding", "comfortable");
    expect(scroller).toHaveClass("overflow-x-hidden");
    expect(scroller).not.toHaveClass("overflow-hidden");
    expect(screen.getAllByTestId("chat-message-virtual-item")[0]).toHaveAttribute(
      "data-message-rail",
      "comfortable",
    );
  });

  it("renders the internal virtual item list with bounded attribute", async () => {
    renderViewport(buildMessages(12));

    const list = await screen.findByTestId("virtuoso-item-list");

    expect(list).toHaveAttribute("data-chat-viewport-list", "bounded");
  });

  it("renders a short message list without producing empty probe rows", async () => {
    renderViewport(buildMessages(1));

    expect(await screen.findAllByTestId("chat-message-virtual-item")).toHaveLength(1);
  });

  it("scrolls to the latest message when a long history is rendered for the first time", async () => {
    renderViewport(buildMessages(80));

    await waitFor(() => {
      expect(scrollToIndexSpy).toHaveBeenCalledWith(79, {
        align: "end",
        behavior: "auto",
      });
    });
  });

  it("does not request older messages on first paint before the reader scrolls", async () => {
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

    await screen.findByTestId("chat-message-viewport-scroll");

    expect(onLoadOlderMessages).not.toHaveBeenCalled();
  });

  it("scrolls to the latest message after a send-triggered request is followed by a new message", async () => {
    const view = renderViewport(buildMessages(80), 0);
    const scroller = await screen.findByTestId("chat-message-viewport-scroll");

    await waitFor(() => {
      expect(scrollToIndexSpy).toHaveBeenCalledWith(79, {
        align: "end",
        behavior: "auto",
      });
    });
    scrollToIndexSpy.mockClear();

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
      expect(scrollToIndexSpy).toHaveBeenCalledWith(80, {
        align: "end",
        behavior: "auto",
      });
    });
  });

  it("cancels a pending send-triggered scroll when the reader scrolls away first", async () => {
    const view = renderViewport(buildMessages(80), 0);
    const scroller = await screen.findByTestId("chat-message-viewport-scroll");

    await waitFor(() => {
      expect(scrollToIndexSpy).toHaveBeenCalledWith(79, {
        align: "end",
        behavior: "auto",
      });
    });
    scrollToIndexSpy.mockClear();

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

  it("requests older messages when scrolling near top and older history exists", async () => {
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

    const scroller = await screen.findByTestId("chat-message-viewport-scroll");
    Object.defineProperty(scroller, "scrollTop", {
      configurable: true,
      writable: true,
      value: 0,
    });

    fireEvent.scroll(scroller);

    expect(onLoadOlderMessages).toHaveBeenCalled();
  });
});
