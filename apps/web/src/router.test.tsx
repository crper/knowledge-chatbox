import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import { i18n } from "@/i18n";

import { queryKeys } from "@/lib/api/query-keys";
import type { AppUser } from "@/lib/api/client";
import { useSessionStore } from "@/lib/auth/session-store";
import { setAccessToken } from "@/lib/auth/token-store";
import { THEME_SYNC_ON_LOGIN_STORAGE_KEY } from "@/lib/config/constants";
import { AppProviders } from "@/providers/app-providers";
import { AppRouter } from "@/router";
import { buildChatSessionContext, cloneJson } from "@/test/chat";
import { buildAppSettings, buildAppUser } from "@/test/fixtures/app";
import { createTestServer, overrideHandler, apiResponse } from "@/test/msw";
import { http, HttpResponse } from "msw";
import type { ChatSourceItem } from "@/features/chat/api/chat";
import { mockDesktopViewport, mockMobileViewport } from "@/test/viewport";

vi.mock("@tanstack/react-virtual", () => ({
  useVirtualizer: vi.fn((options: { count?: number }) => {
    const count = options.count ?? 0;
    const visibleCount = Math.min(count, 40);
    const startIndex = Math.max(0, count - visibleCount);

    return {
      getVirtualItems: () =>
        Array.from({ length: visibleCount }, (_, index) => ({
          index: startIndex + index,
          key: startIndex + index,
          size: 220,
          start: (startIndex + index) * 220,
        })),
      getTotalSize: () => count * 220,
      measureElement: () => {},
      scrollToIndex: vi.fn(),
    };
  }),
}));

const LAST_VISITED_CHAT_SESSION_STORAGE_KEY = "knowledge-chatbox-last-chat-session-id";

function QueryClientCapture({
  onReady,
}: {
  onReady: (client: ReturnType<typeof useQueryClient>) => void;
}) {
  const queryClient = useQueryClient();

  useEffect(() => {
    onReady(queryClient);
  }, [onReady, queryClient]);

  return null;
}

function setupAuthResponse(data: unknown, ok = true, status = 200) {
  const responseData = cloneJson(data);

  if (status === 500) {
    createTestServer({ user: null, authenticated: false });
    overrideHandler(
      http.post(
        "*/api/auth/bootstrap",
        () => new HttpResponse("", { status: 500, statusText: "Server Error" }),
      ),
    );
    overrideHandler(
      http.get(
        "*/api/auth/me",
        () => new HttpResponse("", { status: 500, statusText: "Server Error" }),
      ),
    );
    overrideHandler(
      http.post(
        "*/api/auth/refresh",
        () => new HttpResponse("", { status: 500, statusText: "Server Error" }),
      ),
    );
    overrideHandler(
      http.get("*/api/chat/sessions", () =>
        apiResponse([{ id: 1, title: "Session A", reasoning_mode: "default" }]),
      ),
    );
    overrideHandler(
      http.get("*/api/chat/profile", () =>
        apiResponse({ configured: true, provider: "openai", model: "gpt-5.4" }),
      ),
    );
  } else if (!ok || responseData === null) {
    createTestServer({ user: null, authenticated: false });
    overrideHandler(
      http.get("*/api/chat/sessions", () =>
        apiResponse([{ id: 1, title: "Session A", reasoning_mode: "default" }]),
      ),
    );
    overrideHandler(
      http.get("*/api/chat/profile", () =>
        apiResponse({ configured: true, provider: "openai", model: "gpt-5.4" }),
      ),
    );
  } else {
    const user = (responseData ?? null) as AppUser | null;
    createTestServer({ user, authenticated: ok });
    overrideHandler(
      http.get("*/api/chat/sessions", () =>
        apiResponse([{ id: 1, title: "Session A", reasoning_mode: "default" }]),
      ),
    );
    overrideHandler(
      http.get("*/api/chat/profile", () =>
        apiResponse({
          configured: true,
          provider: "openai",
          model: "gpt-5.4",
        }),
      ),
    );
  }
}

function setupAuthenticatedChatWorkspaceResponse({
  sessions = [{ id: 1, title: "Session A", reasoning_mode: "default" }],
  messagesBySession = {},
}: {
  sessions?: Array<{ id: number; title: string; reasoning_mode: string }>;
  messagesBySession?: Record<number, unknown[]>;
} = {}) {
  const buildSessionContext = (sessionId: number) => {
    const messages = cloneJson(messagesBySession[sessionId] ?? []) as Array<{
      attachments_json?: Array<{
        attachment_id?: string;
        type: string;
        name: string;
        mime_type: string;
        size_bytes?: number;
        document_id?: number | null;
        document_revision_id?: number | null;
      }> | null;
      id: number;
      role: string;
      sources_json?: ChatSourceItem[] | null;
    }>;
    return buildChatSessionContext(
      sessionId,
      messages as Parameters<typeof buildChatSessionContext>[1],
    );
  };

  const user = buildAppUser("admin");
  const settings = buildAppSettings({
    provider_profiles: {
      openai: { api_key: "" },
      ollama: { base_url: "http://localhost:11434" },
    },
  });

  createTestServer({ user, authenticated: true, settings, sessions });

  overrideHandler(
    http.get("*/api/chat/profile", () =>
      apiResponse({
        configured: true,
        provider: "openai",
        model: "gpt-5.4",
      }),
    ),
  );

  overrideHandler(
    http.get("*/api/chat/sessions/:sessionId/context", ({ request }) => {
      const url = new URL(request.url);
      const contextRoute = url.pathname.match(/\/api\/chat\/sessions\/(\d+)\/context$/);
      if (contextRoute) {
        const sessionId = Number(contextRoute[1]);
        return apiResponse(buildSessionContext(sessionId));
      }
      return apiResponse({});
    }),
  );

  overrideHandler(
    http.get("*/api/chat/sessions/:sessionId/messages", ({ request }) => {
      const url = new URL(request.url);
      const messageRoute = url.pathname.match(/\/api\/chat\/sessions\/(\d+)\/messages$/);
      if (messageRoute) {
        const sessionId = Number(messageRoute[1]);
        const params = url.searchParams;
        const limit = params.get("limit");
        const beforeId = params.get("before_id");
        const messages = cloneJson(messagesBySession[sessionId] ?? []) as Array<{ id: number }>;
        const filteredMessages =
          limit === null
            ? messages
            : beforeId === null
              ? messages.slice(-Number(limit))
              : messages.filter((message) => message.id < Number(beforeId)).slice(-Number(limit));
        return apiResponse(filteredMessages);
      }
      return apiResponse([]);
    }),
  );
}

describe("AppRouter", () => {
  beforeEach(async () => {
    localStorage.clear();
    sessionStorage.clear();
    setAccessToken(null);
    document.documentElement.className = "";
    useSessionStore.getState().reset();
    mockDesktopViewport();
    await i18n.changeLanguage("zh-CN");

    const style = document.createElement("style");
    style.textContent = `
      [data-testid="chat-sidebar-virtuoso"],
      .h-full { height: 512px !important; }
    `;
    document.head.appendChild(style);
  });

  it("defaults to zh-CN copy", async () => {
    setupAuthResponse(null, false, 401);

    render(
      <MemoryRouter initialEntries={["/login"]}>
        <AppProviders>
          <AppRouter />
        </AppProviders>
      </MemoryRouter>,
    );

    expect(await screen.findByRole("heading", { name: "登录" })).toBeInTheDocument();
  });

  it("redirects unauthenticated users to login", async () => {
    setupAuthResponse(null, false, 401);

    render(
      <MemoryRouter initialEntries={["/chat"]}>
        <AppProviders>
          <AppRouter />
        </AppProviders>
      </MemoryRouter>,
    );

    expect(await screen.findByRole("heading", { name: "登录" })).toBeInTheDocument();
  });

  it("redirects to login instead of rendering a blank protected shell when current user cache becomes empty", async () => {
    setupAuthResponse(buildAppUser("admin"));
    let capturedQueryClient: ReturnType<typeof useQueryClient> | null = null;

    render(
      <MemoryRouter initialEntries={["/settings"]}>
        <AppProviders>
          <QueryClientCapture
            onReady={(queryClient) => {
              capturedQueryClient = queryClient;
            }}
          />
          <AppRouter />
        </AppProviders>
      </MemoryRouter>,
    );

    expect(await screen.findByRole("heading", { name: "提供商配置" })).toBeInTheDocument();

    await waitFor(() => {
      expect(capturedQueryClient).not.toBeNull();
    });

    await act(async () => {
      capturedQueryClient?.setQueryData(queryKeys.auth.me, null);
    });

    expect(await screen.findByRole("heading", { name: "登录" })).toBeInTheDocument();
    expect(useSessionStore.getState().status).toBe("expired");
  });

  it("surfaces auth service errors instead of redirecting to login", async () => {
    setupAuthResponse(null, false, 500);

    render(
      <MemoryRouter initialEntries={["/chat"]}>
        <AppProviders>
          <AppRouter />
        </AppProviders>
      </MemoryRouter>,
    );

    expect(await screen.findByRole("heading", { name: "无法确认登录状态" })).toBeInTheDocument();
    expect(screen.getByText("认证服务暂时不可用，请稍后重试或返回登录页。")).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "登录" })).not.toBeInTheDocument();
  });

  it("keeps the login page reachable when auth probing fails on /login", async () => {
    overrideHandler(
      http.get("*/api/auth/bootstrap", () =>
        apiResponse({
          authenticated: false,
          access_token: null,
          expires_in: null,
          token_type: "Bearer",
          user: null,
        }),
      ),
    );
    overrideHandler(
      http.get(
        "*/api/auth/me",
        () => new HttpResponse("", { status: 500, statusText: "Server Error" }),
      ),
    );

    render(
      <MemoryRouter initialEntries={["/login"]}>
        <AppProviders>
          <AppRouter />
        </AppProviders>
      </MemoryRouter>,
    );

    expect(await screen.findByRole("heading", { name: "登录" })).toBeInTheDocument();
    expect(screen.queryByText("服务暂时不可用，请稍后重试。")).not.toBeInTheDocument();
  });

  it("redirects from /login when bootstrap restores an authenticated session", async () => {
    setupAuthResponse(buildAppUser("admin"));

    render(
      <MemoryRouter initialEntries={["/login"]}>
        <AppProviders>
          <AppRouter />
        </AppProviders>
      </MemoryRouter>,
    );

    expect(await screen.findByRole("button", { name: "新建会话" })).toBeInTheDocument();
  });

  it("renders admin navigation for authenticated admin users", async () => {
    setupAuthResponse({
      id: 1,
      username: "admin",
      role: "admin",
      status: "active",
      theme_preference: "system",
    });

    render(
      <MemoryRouter initialEntries={["/chat"]}>
        <AppProviders>
          <AppRouter />
        </AppProviders>
      </MemoryRouter>,
    );

    expect(await screen.findByRole("link", { name: "资源" })).toBeInTheDocument();
    expect(screen.getByRole("img", { name: "Knowledge Chatbox 标志" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "对话" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "打开账户菜单" })).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "用户" })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "打开账户菜单" }));

    expect(await screen.findByRole("menuitem", { name: "系统设置" })).toHaveAttribute(
      "href",
      "/settings",
    );
    expect(screen.getByRole("menuitem", { name: "退出登录" })).toBeInTheDocument();
  });

  it("restores the last visited session when opening /chat", async () => {
    window.localStorage.setItem(LAST_VISITED_CHAT_SESSION_STORAGE_KEY, "2");
    setupAuthenticatedChatWorkspaceResponse({
      sessions: [
        { id: 2, title: "Session B", reasoning_mode: "default" },
        { id: 1, title: "Session A", reasoning_mode: "default" },
      ],
      messagesBySession: {
        2: [
          { id: 10, role: "user", content: "问题", status: "succeeded", sources_json: [] },
          { id: 11, role: "assistant", content: "答案", status: "succeeded", sources_json: [] },
        ],
      },
    });

    render(
      <MemoryRouter initialEntries={["/chat"]}>
        <AppProviders>
          <AppRouter />
        </AppProviders>
      </MemoryRouter>,
    );

    const restoredSessionHeading = await screen.findByRole("heading", { name: "Session B" });

    await waitFor(() => {
      expect(restoredSessionHeading).toBeInTheDocument();
    });
    await waitFor(
      () => {
        const markdownFallback = document.querySelector('[data-markdown-fallback="true"]');
        if (markdownFallback) {
          expect(markdownFallback.textContent).toContain("答案");
        } else {
          expect(screen.getByText((content) => content.includes("答案"))).toBeInTheDocument();
        }
      },
      { timeout: 10000 },
    );
    await waitFor(() =>
      expect(window.localStorage.getItem(LAST_VISITED_CHAT_SESSION_STORAGE_KEY)).toBe("2"),
    );
  });

  it("falls back to the most recent session when the stored session is stale", async () => {
    window.localStorage.setItem(LAST_VISITED_CHAT_SESSION_STORAGE_KEY, "99");
    setupAuthenticatedChatWorkspaceResponse({
      sessions: [
        { id: 2, title: "Session B", reasoning_mode: "default" },
        { id: 1, title: "Session A", reasoning_mode: "default" },
      ],
      messagesBySession: {
        2: [
          {
            id: 10,
            role: "assistant",
            content: "最近会话答案",
            status: "succeeded",
            sources_json: [],
          },
        ],
      },
    });

    render(
      <MemoryRouter initialEntries={["/chat"]}>
        <AppProviders>
          <AppRouter />
        </AppProviders>
      </MemoryRouter>,
    );

    expect(await screen.findByRole("heading", { name: "Session B" })).toBeInTheDocument();
    await waitFor(
      () => {
        const markdownFallback = document.querySelector('[data-markdown-fallback="true"]');
        if (markdownFallback) {
          expect(markdownFallback.textContent).toContain("最近会话答案");
        } else {
          expect(
            screen.getByText((content) => content.includes("最近会话答案")),
          ).toBeInTheDocument();
        }
      },
      { timeout: 10000 },
    );
    await waitFor(() =>
      expect(window.localStorage.getItem(LAST_VISITED_CHAT_SESSION_STORAGE_KEY)).toBe("2"),
    );
  });

  it("keeps /chat as an empty entry state when there are no sessions", async () => {
    window.localStorage.setItem(LAST_VISITED_CHAT_SESSION_STORAGE_KEY, "99");
    setupAuthenticatedChatWorkspaceResponse({ sessions: [] });

    render(
      <MemoryRouter initialEntries={["/chat"]}>
        <AppProviders>
          <AppRouter />
        </AppProviders>
      </MemoryRouter>,
    );

    expect(await screen.findByRole("heading", { name: "先开始一个会话" })).toBeInTheDocument();
    await waitFor(() =>
      expect(window.localStorage.getItem(LAST_VISITED_CHAT_SESSION_STORAGE_KEY)).toBeNull(),
    );
  });

  it("renders a concrete session from /chat/:sessionId", async () => {
    const user = buildAppUser("admin");
    createTestServer({ user, authenticated: true });

    overrideHandler(
      http.get("*/api/chat/sessions", () =>
        apiResponse([
          { id: 1, title: "Session A", reasoning_mode: "default" },
          { id: 2, title: "Session B", reasoning_mode: "default" },
        ]),
      ),
    );

    overrideHandler(
      http.get("*/api/chat/profile", () =>
        apiResponse({
          configured: true,
          provider: "openai",
          model: "gpt-5.4",
        }),
      ),
    );

    overrideHandler(
      http.get("*/api/chat/sessions/2/context", () =>
        apiResponse({
          session_id: 2,
          attachment_count: 0,
          attachments: [],
          latest_assistant_message_id: 11,
          latest_assistant_sources: [],
        }),
      ),
    );

    overrideHandler(
      http.get("*/api/chat/sessions/2/messages", () =>
        apiResponse([
          { id: 10, role: "user", content: "问题", status: "succeeded", sources_json: [] },
          { id: 11, role: "assistant", content: "答案", status: "succeeded", sources_json: [] },
        ]),
      ),
    );

    render(
      <MemoryRouter initialEntries={["/chat/2"]}>
        <AppProviders>
          <AppRouter />
        </AppProviders>
      </MemoryRouter>,
    );

    expect(await screen.findByRole("heading", { name: "Session B" })).toBeInTheDocument();
    await waitFor(
      () => {
        const markdownFallback = document.querySelector('[data-markdown-fallback="true"]');
        if (markdownFallback) {
          expect(markdownFallback.textContent).toContain("答案");
        } else {
          expect(screen.getByText((content) => content.includes("答案"))).toBeInTheDocument();
        }
      },
      { timeout: 10000 },
    );
  });

  it("redirects authenticated users from root to the chat workspace", async () => {
    setupAuthResponse({
      id: 1,
      username: "admin",
      role: "admin",
      status: "active",
      theme_preference: "system",
    });

    render(
      <MemoryRouter initialEntries={["/"]}>
        <AppProviders>
          <AppRouter />
        </AppProviders>
      </MemoryRouter>,
    );

    expect(await screen.findByRole("button", { name: "新建会话" })).toBeInTheDocument();
    expect(screen.queryByText("欢迎使用 Knowledge Chatbox")).not.toBeInTheDocument();
  });

  it("allows admin to access settings with user-management entry", async () => {
    setupAuthResponse({
      id: 1,
      username: "admin",
      role: "admin",
      status: "active",
      theme_preference: "system",
    });

    render(
      <MemoryRouter initialEntries={["/settings"]}>
        <AppProviders>
          <AppRouter />
        </AppProviders>
      </MemoryRouter>,
    );

    const chatLink = await screen.findByRole("link", { name: "对话" });
    const knowledgeLink = screen.getByRole("link", { name: "资源" });

    expect(chatLink).toHaveClass("w-full");
    expect(knowledgeLink).toHaveClass("w-full");
    expect(screen.getByRole("heading", { name: "提供商配置" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "提供商配置" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "系统提示词" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "偏好与外观" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "账号安全" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "用户管理" })).toBeInTheDocument();
    expect(await screen.findByRole("combobox", { name: "主 Provider" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "打开账户菜单" })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "打开账户菜单" }));

    expect(await screen.findByRole("menuitem", { name: "退出登录" })).toBeInTheDocument();
  });

  it("shows the standard workspace sidebar alongside the page content on desktop routes", async () => {
    setupAuthResponse({
      id: 1,
      username: "admin",
      role: "admin",
      status: "active",
      theme_preference: "system",
    });
    overrideHandler(
      http.get("*/api/documents", () =>
        apiResponse([
          {
            created_at: "2026-03-19T08:00:00Z",
            created_by_user_id: 1,
            id: 20,
            latest_revision: null,
            logical_name: "test.md",
            space_id: 1,
            status: "active",
            title: "test.md",
            updated_at: "2026-03-19T09:00:00Z",
            updated_by_user_id: 1,
          },
        ]),
      ),
    );
    overrideHandler(http.get("*/api/documents/:documentId/revisions", () => apiResponse([])));
    overrideHandler(
      http.get("*/api/documents/upload-readiness", () =>
        apiResponse({ can_upload: true, blocking_reason: null, image_fallback: false }),
      ),
    );

    render(
      <MemoryRouter initialEntries={["/knowledge"]}>
        <AppProviders>
          <AppRouter />
        </AppProviders>
      </MemoryRouter>,
    );

    const layout = await screen.findByTestId("standard-desktop-layout");
    const sidebar = await screen.findByRole("complementary", { name: "工作台侧栏" });
    const knowledgeLink = screen.getByRole("link", { name: "资源" });

    expect(layout).toBeInTheDocument();
    expect(sidebar).toBeInTheDocument();
    expect(knowledgeLink).toHaveAttribute("href", "/knowledge");
    expect(screen.getByRole("main")).toBeInTheDocument();
  });

  it("keeps the settings content reachable on mobile layouts", async () => {
    mockMobileViewport();
    setupAuthResponse({
      id: 1,
      username: "admin",
      role: "admin",
      status: "active",
      theme_preference: "system",
    });

    render(
      <MemoryRouter initialEntries={["/settings"]}>
        <AppProviders>
          <AppRouter />
        </AppProviders>
      </MemoryRouter>,
    );

    expect(await screen.findByRole("button", { name: "打开导航面板" })).toBeInTheDocument();

    expect(await screen.findByRole("heading", { name: "提供商配置" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "保存设置" })).toBeInTheDocument();
  });

  it("allows standard users to stay on settings and hides user-management entry", async () => {
    setupAuthResponse({
      id: 2,
      username: "user",
      role: "user",
      status: "active",
      theme_preference: "system",
    });

    render(
      <MemoryRouter initialEntries={["/settings"]}>
        <AppProviders>
          <AppRouter />
        </AppProviders>
      </MemoryRouter>,
    );

    expect(await screen.findByRole("heading", { name: "偏好与外观" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "偏好与外观" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "账号安全" })).toBeInTheDocument();
    expect(await screen.findByLabelText("语言")).toBeInTheDocument();
    expect(
      screen.queryByRole("combobox", { name: "Response Route Provider" }),
    ).not.toBeInTheDocument();
    expect(screen.queryByRole("textbox", { name: "系统提示词" })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "提供商配置" })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "系统提示词" })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "用户管理" })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "前往用户管理" })).not.toBeInTheDocument();
  });

  it("shows a forbidden page for standard users visiting /users", async () => {
    setupAuthResponse({
      id: 2,
      username: "user",
      role: "user",
      status: "active",
      theme_preference: "system",
    });

    render(
      <MemoryRouter initialEntries={["/users"]}>
        <AppProviders>
          <AppRouter />
        </AppProviders>
      </MemoryRouter>,
    );

    expect(await screen.findByRole("heading", { name: "403" })).toBeInTheDocument();
    expect(screen.getByText("你没有访问该页面的权限。")).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "用户管理" })).not.toBeInTheDocument();
  });

  it("renders english navigation when stored language is en", async () => {
    localStorage.setItem("knowledge-chatbox-language", "en");
    setupAuthResponse({
      id: 1,
      username: "admin",
      role: "admin",
      status: "active",
      theme_preference: "system",
    });

    render(
      <MemoryRouter initialEntries={["/chat"]}>
        <AppProviders>
          <AppRouter />
        </AppProviders>
      </MemoryRouter>,
    );

    expect(await screen.findByRole("link", { name: "Resources" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Chat" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Open account menu" })).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Users" })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Open account menu" }));

    expect(await screen.findByRole("menuitem", { name: "System settings" })).toHaveAttribute(
      "href",
      "/settings",
    );
    expect(screen.getByRole("menuitem", { name: "Log Out" })).toBeInTheDocument();
  });

  it("applies stored theme preference", async () => {
    localStorage.setItem("knowledge-chatbox-theme", "dark");
    setupAuthResponse(null, false, 401);

    render(
      <MemoryRouter initialEntries={["/login"]}>
        <AppProviders>
          <AppRouter />
        </AppProviders>
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(document.documentElement).toHaveClass("dark");
      expect(document.documentElement.dataset.theme).toBeUndefined();
    });
  });

  it("applies authenticated user theme preference over local storage", async () => {
    localStorage.setItem("knowledge-chatbox-theme", "dark");
    setupAuthResponse({
      id: 1,
      username: "admin",
      role: "admin",
      status: "active",
      theme_preference: "light",
    });

    render(
      <MemoryRouter initialEntries={["/chat"]}>
        <AppProviders>
          <AppRouter />
        </AppProviders>
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(document.documentElement).not.toHaveClass("dark");
      expect(window.localStorage.getItem("knowledge-chatbox-theme")).toBe("light");
      expect(document.documentElement.dataset.theme).toBeUndefined();
    });
  });

  it("does not reapply a stale pending login theme after the user changes theme in the workspace", async () => {
    sessionStorage.setItem(THEME_SYNC_ON_LOGIN_STORAGE_KEY, "dark");

    const user = buildAppUser("admin", { theme_preference: "system" });
    createTestServer({ user, authenticated: true });

    overrideHandler(
      http.patch("*/api/auth/preferences", ({ request }) => {
        const parsedBody: { theme_preference: "light" | "dark" | "system" } =
          typeof request.body === "string"
            ? (JSON.parse(request.body) as { theme_preference: "light" | "dark" | "system" })
            : { theme_preference: "light" };

        return apiResponse(
          buildAppUser("admin", {
            theme_preference: parsedBody.theme_preference,
          }),
        );
      }),
    );

    overrideHandler(
      http.get("*/api/chat/sessions", () =>
        apiResponse([{ id: 1, title: "Session A", reasoning_mode: "default" }]),
      ),
    );

    overrideHandler(
      http.get("*/api/chat/profile", () =>
        apiResponse({
          configured: true,
          provider: "openai",
          model: "gpt-5.4",
        }),
      ),
    );

    render(
      <MemoryRouter initialEntries={["/chat"]}>
        <AppProviders>
          <AppRouter />
        </AppProviders>
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(document.documentElement).toHaveClass("dark");
    });

    fireEvent.click(await screen.findByRole("button", { name: "打开账户菜单" }));
    fireEvent.click(await screen.findByRole("menuitemradio", { name: "浅色" }));

    await waitFor(() => {
      expect(document.documentElement).not.toHaveClass("dark");
      expect(window.localStorage.getItem("knowledge-chatbox-theme")).toBe("light");
    });
  });
});
