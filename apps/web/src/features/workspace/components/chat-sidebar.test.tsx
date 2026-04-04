import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import { VirtuosoMockContext } from "react-virtuoso";

import type { AppUser } from "@/lib/api/client";
import { useChatUiStore } from "@/features/chat/store/chat-ui-store";
import { I18nProvider } from "@/providers/i18n-provider";
import { ThemeProvider } from "@/providers/theme-provider";
import { jsonResponse } from "@/test/http";
import { createTestQueryClient } from "@/test/query-client";
import { ChatSidebar } from "./chat-sidebar";

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
  let originalState = useChatUiStore.getState();

  beforeEach(() => {
    originalState = useChatUiStore.getState();
  });

  afterEach(() => {
    useChatUiStore.setState(originalState);
    vi.unstubAllGlobals();
  });

  function renderSidebar(initialEntry = "/chat") {
    const queryClient = createTestQueryClient({
      defaultOptions: {
        queries: {
          retry: false,
        },
      },
    });

    return render(
      <VirtuosoMockContext.Provider value={{ itemHeight: 72, viewportHeight: 320 }}>
        <MemoryRouter initialEntries={[initialEntry]}>
          <I18nProvider>
            <ThemeProvider>
              <QueryClientProvider client={queryClient}>
                <div style={{ height: "640px", width: "320px" }}>
                  <ChatSidebar
                    onCreateSession={vi.fn().mockResolvedValue(undefined)}
                    onLogout={vi.fn().mockResolvedValue(undefined)}
                    pathname={initialEntry}
                    searchValue=""
                    setSearchValue={vi.fn()}
                    user={buildUser()}
                  />
                </div>
              </QueryClientProvider>
            </ThemeProvider>
          </I18nProvider>
        </MemoryRouter>
      </VirtuosoMockContext.Provider>,
    );
  }

  it("does not auto-select the first session while rendering", async () => {
    const setActiveSessionId = vi.fn();
    useChatUiStore.setState({
      activeSessionId: null,
      setActiveSessionId,
    });

    vi.stubGlobal(
      "fetch",
      vi.fn().mockImplementation((input: string) => {
        if (input.endsWith("/api/chat/sessions")) {
          return Promise.resolve(
            jsonResponse({
              success: true,
              data: [
                { id: 1, title: "Session A" },
                { id: 2, title: "Session B" },
              ],
              error: null,
            }),
          );
        }

        return Promise.resolve(jsonResponse({ success: true, data: [], error: null }));
      }),
    );

    renderSidebar();

    expect(await screen.findByRole("link", { name: "Session A" })).toBeInTheDocument();
    expect(setActiveSessionId).not.toHaveBeenCalled();
  });

  it("virtualizes a long session list instead of mounting every row", async () => {
    useChatUiStore.setState({
      activeSessionId: null,
      setActiveSessionId: vi.fn(),
    });

    vi.stubGlobal(
      "fetch",
      vi.fn().mockImplementation((input: string) => {
        if (input.endsWith("/api/chat/sessions")) {
          return Promise.resolve(
            jsonResponse({
              success: true,
              data: Array.from({ length: 160 }, (_, index) => ({
                id: index + 1,
                title: `Session ${index + 1}`,
              })),
              error: null,
            }),
          );
        }

        return Promise.resolve(jsonResponse({ success: true, data: [], error: null }));
      }),
    );

    renderSidebar();

    await waitFor(() => {
      expect(screen.getByRole("link", { name: "Session 1" })).toBeInTheDocument();
    });

    expect(screen.getAllByTestId(/chat-session-actions-/).length).toBeLessThan(160);
  });

  it("renders session actions in a dedicated horizontal action rail", async () => {
    useChatUiStore.setState({
      activeSessionId: null,
      setActiveSessionId: vi.fn(),
    });

    vi.stubGlobal(
      "fetch",
      vi.fn().mockImplementation((input: string) => {
        if (input.endsWith("/api/chat/sessions")) {
          return Promise.resolve(
            jsonResponse({
              success: true,
              data: [{ id: 1, title: "新的会话" }],
              error: null,
            }),
          );
        }

        return Promise.resolve(jsonResponse({ success: true, data: [], error: null }));
      }),
    );

    renderSidebar();

    expect(await screen.findByRole("link", { name: "新的会话" })).toBeInTheDocument();

    const row = screen.getByTestId("chat-session-row-1");
    const rail = screen.getByTestId("chat-session-action-rail-1");

    expect(row).toContainElement(rail);
    expect(within(rail).getByRole("button", { name: "重命名 新的会话" })).toBeInTheDocument();
    expect(within(rail).getByRole("button", { name: "删除 新的会话" })).toBeInTheDocument();
  });

  it("stores a cleared session title as null so the localized fallback keeps working", async () => {
    const sessions: Array<{ id: number; title: string | null }> = [{ id: 1, title: "Session A" }];
    const fetchMock = vi.fn().mockImplementation((input: string, init?: RequestInit) => {
      if (input.endsWith("/api/chat/sessions/1") && init?.method === "PATCH") {
        const body =
          typeof init.body === "string" ? (JSON.parse(init.body) as { title?: string | null }) : {};
        sessions[0] = { id: 1, title: body.title ?? null };
        return Promise.resolve(
          jsonResponse({
            success: true,
            data: sessions[0],
            error: null,
          }),
        );
      }

      if (input.endsWith("/api/chat/sessions")) {
        return Promise.resolve(
          jsonResponse({
            success: true,
            data: sessions,
            error: null,
          }),
        );
      }

      return Promise.resolve(jsonResponse({ success: true, data: [], error: null }));
    });

    vi.stubGlobal("fetch", fetchMock);

    renderSidebar("/chat/1");

    fireEvent.click(await screen.findByRole("button", { name: "重命名 Session A" }));
    fireEvent.change(screen.getByRole("textbox", { name: "会话名称" }), {
      target: { value: "   " },
    });
    fireEvent.click(screen.getByRole("button", { name: "保存" }));

    expect(await screen.findByRole("link", { name: "未命名会话" })).toBeInTheDocument();

    const patchCall = fetchMock.mock.calls.find(
      ([url, init]) =>
        typeof url === "string" && url.endsWith("/api/chat/sessions/1") && init?.method === "PATCH",
    );

    expect(patchCall).toBeDefined();
    expect(JSON.parse(String(patchCall?.[1]?.body))).toMatchObject({ title: null });
  });

  it("submits the rename draft when Enter is pressed", async () => {
    const sessions: Array<{ id: number; title: string | null }> = [{ id: 1, title: "Session A" }];
    const fetchMock = vi.fn().mockImplementation((input: string, init?: RequestInit) => {
      if (input.endsWith("/api/chat/sessions/1") && init?.method === "PATCH") {
        const body =
          typeof init.body === "string" ? (JSON.parse(init.body) as { title?: string | null }) : {};
        sessions[0] = { id: 1, title: body.title ?? null };
        return Promise.resolve(
          jsonResponse({
            success: true,
            data: sessions[0],
            error: null,
          }),
        );
      }

      if (input.endsWith("/api/chat/sessions")) {
        return Promise.resolve(
          jsonResponse({
            success: true,
            data: sessions,
            error: null,
          }),
        );
      }

      return Promise.resolve(jsonResponse({ success: true, data: [], error: null }));
    });

    vi.stubGlobal("fetch", fetchMock);

    renderSidebar("/chat/1");

    fireEvent.click(await screen.findByRole("button", { name: "重命名 Session A" }));
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

    const patchCall = fetchMock.mock.calls.find(
      ([url, init]) =>
        typeof url === "string" && url.endsWith("/api/chat/sessions/1") && init?.method === "PATCH",
    );

    expect(patchCall).toBeDefined();
    expect(JSON.parse(String(patchCall?.[1]?.body))).toMatchObject({
      title: "Session A Renamed",
    });
  });

  it("does not submit the rename draft while IME composition is active", async () => {
    const fetchMock = vi.fn().mockImplementation((input: string) => {
      if (input.endsWith("/api/chat/sessions")) {
        return Promise.resolve(
          jsonResponse({
            success: true,
            data: [{ id: 1, title: "Session A" }],
            error: null,
          }),
        );
      }

      return Promise.resolve(jsonResponse({ success: true, data: [], error: null }));
    });

    vi.stubGlobal("fetch", fetchMock);

    renderSidebar("/chat/1");

    fireEvent.click(await screen.findByRole("button", { name: "重命名 Session A" }));
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

    expect(
      fetchMock.mock.calls.some(
        ([url, init]) =>
          typeof url === "string" &&
          url.endsWith("/api/chat/sessions/1") &&
          init?.method === "PATCH",
      ),
    ).toBe(false);
    expect(screen.getByRole("textbox", { name: "会话名称" })).toHaveValue("会话 A");
  });

  it("renders each session row as a concrete chat route link", async () => {
    useChatUiStore.setState({
      activeSessionId: null,
      setActiveSessionId: vi.fn(),
    });

    vi.stubGlobal(
      "fetch",
      vi.fn().mockImplementation((input: string) => {
        if (input.endsWith("/api/chat/sessions")) {
          return Promise.resolve(
            jsonResponse({
              success: true,
              data: [{ id: 2, title: "Session B" }],
              error: null,
            }),
          );
        }

        return Promise.resolve(jsonResponse({ success: true, data: [], error: null }));
      }),
    );

    renderSidebar("/chat/2");

    const link = await screen.findByRole("link", { name: "Session B" });
    expect(link).toHaveAttribute("href", "/chat/2");
    expect(link.closest("[data-active='true']")).not.toBeNull();
  });
});
