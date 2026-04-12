import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { QueryClientProvider } from "@tanstack/react-query";

import type { AppUser } from "@/lib/api/client";
import { useChatComposerStore } from "@/features/chat/store/chat-composer-store";
import { I18nProvider } from "@/providers/i18n-provider";
import { ThemeProvider } from "@/providers/theme-provider";
import { http } from "msw";
import { apiResponse, overrideHandler } from "@/test/msw";
import { createTestQueryClient } from "@/test/query-client";
import { TestRouter } from "@/test/test-router";
import { ChatSidebar } from "./chat-sidebar";

vi.mock("@tanstack/react-virtual", () => ({
  useVirtualizer: vi.fn(
    (options: {
      count?: number;
      getScrollElement?: () => HTMLElement | null;
      estimateSize?: (index: number) => number;
      overscan?: number;
    }) => {
      const count = options.count ?? 0;
      const visibleCount = Math.min(count, 10);

      return {
        getVirtualItems: () =>
          Array.from({ length: visibleCount }, (_, index) => ({
            index,
            start: index * 56,
            size: 56,
            key: index,
          })),
        getTotalSize: () => count * 56,
        scrollToIndex: vi.fn(),
      };
    },
  ),
}));

function buildUser(): AppUser {
  return {
    id: 1,
    username: "admin",
    role: "admin",
    status: "active",
    theme_preference: "system",
  };
}

describe("ChatSidebar", () => {
  let originalState = useChatComposerStore.getState();

  beforeEach(() => {
    originalState = useChatComposerStore.getState();
    useChatComposerStore.persist.clearStorage();
  });

  afterEach(() => {
    useChatComposerStore.setState(originalState);
  });

  function resetStore() {
    useChatComposerStore.persist.clearStorage();
    useChatComposerStore.setState({
      attachmentsBySession: {},
      draftsBySession: {},
      sendShortcut: "enter",
    });
  }

  function mockSessions(sessions: Array<{ id: number; title: string }>) {
    overrideHandler(http.get("*/api/chat/sessions", () => apiResponse(sessions)));
  }

  function mockRenameHandlers(initialTitle: string) {
    let currentTitle = initialTitle;

    overrideHandler(
      http.get("*/api/chat/sessions", () => apiResponse([{ id: 1, title: currentTitle }])),
    );
    overrideHandler(
      http.patch("*/api/chat/sessions/1", async ({ request }) => {
        const body = (await request.json()) as { title?: string | null };
        currentTitle = (body.title ?? "") as string;
        return apiResponse({ id: 1, title: currentTitle });
      }),
    );
  }

  function renderSidebar(initialEntry = "/chat") {
    const queryClient = createTestQueryClient({
      defaultOptions: {
        queries: {
          retry: false,
        },
      },
    });

    return render(
      <TestRouter initialEntry={initialEntry}>
        <I18nProvider>
          <ThemeProvider>
            <QueryClientProvider client={queryClient}>
              <div style={{ height: "640px", width: "320px" }}>
                <ChatSidebar
                  onCreateSession={vi.fn()}
                  onLogout={vi.fn()}
                  pathname={initialEntry}
                  searchValue=""
                  setSearchValue={vi.fn()}
                  user={buildUser()}
                />
              </div>
            </QueryClientProvider>
          </ThemeProvider>
        </I18nProvider>
      </TestRouter>,
    );
  }

  it("does not auto-select the first session while rendering", async () => {
    useChatComposerStore.setState({ attachmentsBySession: {}, draftsBySession: {} });

    mockSessions([
      { id: 1, title: "Session A" },
      { id: 2, title: "Session B" },
    ]);

    renderSidebar();

    expect(await screen.findByRole("link", { name: "Session A" })).toBeInTheDocument();
  });

  it("virtualizes a long session list instead of mounting every row", async () => {
    resetStore();

    mockSessions(
      Array.from({ length: 160 }, (_, index) => ({
        id: index + 1,
        title: `Session ${index + 1}`,
      })),
    );

    renderSidebar();

    await waitFor(() => {
      expect(screen.getByRole("link", { name: "Session 1" })).toBeInTheDocument();
    });

    expect(screen.getAllByTestId(/chat-session-actions-/).length).toBeLessThan(160);
  });

  it("renders session actions as a dropdown menu trigger", async () => {
    resetStore();

    mockSessions([{ id: 1, title: "新的会话" }]);

    renderSidebar();

    expect(await screen.findByRole("link", { name: "新的会话" })).toBeInTheDocument();

    const row = screen.getByTestId("chat-session-row-1");
    const menu = screen.getByTestId("chat-session-action-menu-1");
    const trigger = within(menu).getByTestId("chat-session-menu-trigger-1");

    expect(row).toContainElement(menu);
    fireEvent.click(trigger);
    expect(await screen.findByRole("menuitem", { name: "重命名" })).toBeInTheDocument();
    expect(screen.getByRole("menuitem", { name: "删除" })).toBeInTheDocument();
  });

  it("renders a dedicated compact new-session entry beneath the search field", async () => {
    resetStore();

    mockSessions([{ id: 1, title: "新的会话" }]);

    renderSidebar();

    await screen.findByRole("link", { name: "新的会话" });

    const searchBox = screen.getByRole("textbox", { name: "搜索会话" });
    const newSessionButton = screen.getByRole("button", { name: "新建会话" });

    expect(searchBox).toBeInTheDocument();
    expect(newSessionButton).toHaveTextContent("新建会话");
  });

  it("stores a cleared session title as null so the localized fallback keeps working", async () => {
    mockRenameHandlers("Session A");

    renderSidebar("/chat/1");

    fireEvent.click(await screen.findByRole("button", { name: "打开 Session A 的会话菜单" }));
    fireEvent.click(await screen.findByRole("menuitem", { name: "重命名" }));
    fireEvent.change(screen.getByRole("textbox", { name: "会话名称" }), {
      target: { value: "   " },
    });
    fireEvent.click(screen.getByRole("button", { name: "保存" }));

    expect(await screen.findByRole("link", { name: "未命名会话" })).toBeInTheDocument();
  });

  it("submits the rename draft when Enter is pressed", async () => {
    mockRenameHandlers("Session A");

    renderSidebar("/chat/1");

    fireEvent.click(await screen.findByRole("button", { name: "打开 Session A 的会话菜单" }));
    fireEvent.click(await screen.findByRole("menuitem", { name: "重命名" }));
    const input = screen.getByRole("textbox", { name: "会话名称" });
    fireEvent.change(input, {
      target: { value: "Session A Renamed" },
    });
    fireEvent.keyDown(input, {
      key: "Enter",
      code: "Enter",
      charCode: 13,
    });

    expect(await screen.findByRole("link", { name: "Session A Renamed" })).toBeInTheDocument();
  });

  it("does not submit the rename draft while IME composition is active", async () => {
    mockSessions([{ id: 1, title: "Session A" }]);

    renderSidebar("/chat/1");

    fireEvent.click(await screen.findByRole("button", { name: "打开 Session A 的会话菜单" }));
    fireEvent.click(await screen.findByRole("menuitem", { name: "重命名" }));
    const input = screen.getByRole("textbox", { name: "会话名称" });
    fireEvent.change(input, {
      target: { value: "会话 A" },
    });
    fireEvent.keyDown(input, {
      key: "Enter",
      code: "Enter",
      charCode: 13,
      isComposing: true,
    });

    expect(screen.getByRole("textbox", { name: "会话名称" })).toHaveValue("会话 A");
  });

  it("renders each session row as a concrete chat route link", async () => {
    resetStore();

    mockSessions([{ id: 2, title: "Session B" }]);

    renderSidebar("/chat/2");

    const link = await screen.findByRole("link", { name: "Session B" });
    expect(link).toHaveAttribute("href", "/chat/2");
    expect(link.closest("[data-active='true']")).not.toBeNull();
  });
});
