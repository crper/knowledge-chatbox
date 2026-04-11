import { render, screen, waitFor } from "@testing-library/react";

import { AppProviders } from "@/providers/app-providers";
import type { ChatMessageItem } from "@/features/chat/api/chat";
import { TestRouter } from "@/test/test-router";
import { ChatPage } from "./chat-page";

vi.mock("@/features/chat/api/chat-query", () => ({
  chatSessionsQueryOptions: () => ({
    queryKey: ["chat", "sessions"],
    queryFn: async () => [{ id: 1, title: "Session A" }],
  }),
  chatProfileQueryOptions: () => ({
    queryKey: ["chat", "profile"],
    queryFn: async () => null,
  }),
}));

const messageViewportRenderSpy = vi.fn();

const mockWorkspaceState: {
  current: {
    activeSession: { id: number; title: string } | null;
    activeSessionId: number | null;
    attachments: [];
    attachFiles: (files: File[]) => void;
    deleteFailedMessage: (message: ChatMessageItem) => Promise<void>;
    displayMessages: ChatMessageItem[];
    draft: string;
    editFailedMessage: (message: ChatMessageItem) => void;
    hasMessages: boolean;
    hasOlderMessages: boolean;
    isLoadingOlderMessages: boolean;
    loadOlderMessages: () => Promise<void>;
    removeAttachment: (sessionId: number | null, attachmentId: string) => void;
    rejectFiles: () => void;
    retryMessage: (message: ChatMessageItem) => Promise<void>;
    scrollToLatestRequestKey: number;
    sendShortcut: "shift-enter" | "enter";
    setSendShortcut: (shortcut: "shift-enter" | "enter") => void;
    sessionsReady: boolean;
    sessions: Array<{ id: number; title: string }>;
    setDraft: (sessionId: number | null, draft: string) => void;
    stopMessage: () => void;
    submitMessage: () => Promise<void>;
    submitPending: boolean;
  };
} = {
  current: {
    activeSession: { id: 1, title: "Session A" },
    activeSessionId: 1,
    attachments: [],
    attachFiles: vi.fn(),
    deleteFailedMessage: vi.fn(async () => {}),
    displayMessages: [
      {
        id: 1,
        role: "user",
        content: "hello",
        status: "succeeded",
        sources_json: [],
      },
      {
        id: 2,
        role: "assistant",
        content: "world",
        status: "succeeded",
        sources_json: [],
      },
    ],
    draft: "hello",
    editFailedMessage: vi.fn(),
    hasMessages: true,
    hasOlderMessages: false,
    isLoadingOlderMessages: false,
    loadOlderMessages: vi.fn(async () => {}),
    removeAttachment: vi.fn(),
    rejectFiles: vi.fn(),
    retryMessage: vi.fn(async () => {}),
    scrollToLatestRequestKey: 0,
    sendShortcut: "shift-enter",
    setSendShortcut: vi.fn(),
    sessionsReady: true,
    sessions: [{ id: 1, title: "Session A" }],
    setDraft: vi.fn(),
    stopMessage: vi.fn(),
    submitMessage: vi.fn(async () => {}),
    submitPending: false,
  },
};

vi.mock("@/features/chat/hooks/use-chat-workspace", () => ({
  useChatWorkspace: () => mockWorkspaceState.current,
}));

vi.mock("@/features/chat/components/message-input", () => ({
  MessageInput: ({ submitPending }: { submitPending?: boolean }) => (
    <div data-testid="message-input" data-submit-pending={submitPending ? "true" : "false"} />
  ),
}));

vi.mock("@/features/chat/components/chat-message-viewport", async () => {
  const React = await import("react");

  return {
    ChatMessageViewport: React.memo(function MockChatMessageViewport({
      messages,
      scrollToLatestRequestKey,
    }: {
      messages: ChatMessageItem[];
      scrollToLatestRequestKey?: number;
    }) {
      messageViewportRenderSpy({
        messages,
        scrollToLatestRequestKey,
      });
      return <div data-testid="chat-message-viewport">{messages.length}</div>;
    }),
  };
});

describe("ChatPage rendering", () => {
  function renderChatPageTree(initialEntry = "/chat/1") {
    return (
      <TestRouter initialEntry={initialEntry} path="/chat/:sessionId">
        <AppProviders>
          <ChatPage />
        </AppProviders>
      </TestRouter>
    );
  }

  function renderChatPage(initialEntry = "/chat/1") {
    return render(renderChatPageTree(initialEntry));
  }

  beforeEach(() => {
    messageViewportRenderSpy.mockClear();
    mockWorkspaceState.current = {
      ...mockWorkspaceState.current,
      activeSession: { id: 1, title: "Session A" },
      activeSessionId: 1,
      displayMessages: [
        {
          id: 1,
          role: "user",
          content: "hello",
          status: "succeeded",
          sources_json: [],
        },
        {
          id: 2,
          role: "assistant",
          content: "world",
          status: "succeeded",
          sources_json: [],
        },
      ],
      hasOlderMessages: false,
      isLoadingOlderMessages: false,
      loadOlderMessages: vi.fn(async () => {}),
      scrollToLatestRequestKey: 0,
      sessionsReady: true,
      submitPending: false,
    };
  });

  it("does not rerender ChatMessageViewport when only submitPending changes", async () => {
    const view = renderChatPage();

    await waitFor(() => {
      expect(messageViewportRenderSpy).toHaveBeenCalled();
    });
    const renderCountAfterMount = messageViewportRenderSpy.mock.calls.length;

    mockWorkspaceState.current = {
      ...mockWorkspaceState.current,
      submitPending: true,
    };

    view.rerender(renderChatPageTree("/chat/1"));

    expect(messageViewportRenderSpy).toHaveBeenCalledTimes(renderCountAfterMount);
  });

  it("rerenders ChatMessageViewport when an explicit scroll-to-latest request changes", async () => {
    const view = renderChatPage();

    await waitFor(() => {
      expect(messageViewportRenderSpy).toHaveBeenCalled();
    });
    const renderCountAfterMount = messageViewportRenderSpy.mock.calls.length;

    mockWorkspaceState.current = {
      ...mockWorkspaceState.current,
      scrollToLatestRequestKey: 1,
    };

    view.rerender(renderChatPageTree("/chat/1"));

    await waitFor(() => {
      expect(messageViewportRenderSpy).toHaveBeenCalledTimes(renderCountAfterMount + 1);
    });
    expect(messageViewportRenderSpy.mock.lastCall?.[0]).toMatchObject({
      scrollToLatestRequestKey: 1,
    });
  });

  it("keeps a compact header without duplicate workspace hint text", async () => {
    renderChatPage();

    expect(await screen.findByRole("heading", { name: "Session A" })).toBeInTheDocument();
    expect(screen.queryByText("围绕当前资源上下文发起问答。")).not.toBeInTheDocument();
  });

  it("shows a waiting state instead of the guided empty state while the first turn is submitting", async () => {
    mockWorkspaceState.current = {
      ...mockWorkspaceState.current,
      activeSession: { id: 1, title: "Session A" },
      activeSessionId: 1,
      displayMessages: [],
      draft: "",
      hasMessages: false,
      submitPending: true,
    };

    renderChatPage();

    expect(await screen.findByText("正在生成回答")).toBeInTheDocument();
    expect(screen.queryByText("开始您今天的第一个问题？")).not.toBeInTheDocument();
  });
});
