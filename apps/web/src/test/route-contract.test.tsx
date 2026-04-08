import { act, screen, waitFor } from "@testing-library/react";

import { i18n } from "@/i18n";
import { queryKeys } from "@/lib/api/query-keys";
import { useSessionStore } from "@/lib/auth/session-store";
import { setAccessToken } from "@/lib/auth/token-store";
import { LAST_VISITED_CHAT_SESSION_STORAGE_KEY } from "@/features/chat/utils/chat-session-recovery";
import { buildChatSessionContext, cloneJson } from "@/test/chat";
import { buildAppUser } from "@/test/fixtures/app";
import { apiResponse, createTestServer, overrideHandler } from "@/test/msw";
import { http, HttpResponse } from "msw";
import type { ChatSourceItem } from "@/features/chat/api/chat";
import { buildAppSettings } from "@/test/fixtures/app";
import { mockDesktopViewport } from "@/test/viewport";
import { renderRoute } from "./render-route";

function setupAuthResponse(data: unknown, ok = true, status = 200) {
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
    return;
  }

  if (!ok || data === null) {
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
    return;
  }

  createTestServer({ user: data as ReturnType<typeof buildAppUser>, authenticated: ok });
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

describe("route contract (TanStack runtime)", () => {
  beforeEach(async () => {
    localStorage.clear();
    sessionStorage.clear();
    setAccessToken(null);
    document.documentElement.className = "";
    useSessionStore.getState().reset();
    mockDesktopViewport();
    await i18n.changeLanguage("zh-CN");
  });

  it("redirects bootstrapped anonymous users from protected pages to /login with redirect", async () => {
    setupAuthResponse(null, false, 401);

    const { history } = renderRoute("/knowledge?query=notes");

    expect(await screen.findByRole("heading", { name: "登录" })).toBeInTheDocument();
    expect(history.location.pathname).toBe("/login");
    expect(history.location.search).toBe("?redirect=%2Fknowledge");
  });

  it("redirects authenticated users away from /login", async () => {
    setupAuthResponse(buildAppUser("admin"));

    const { history } = renderRoute("/login");

    expect(await screen.findByRole("button", { name: "新建会话" })).toBeInTheDocument();
    expect(history.location.pathname).toBe("/chat/1");
  });

  it("surfaces auth degraded state instead of redirecting to /login", async () => {
    setupAuthResponse(null, false, 500);

    renderRoute("/chat");

    expect(await screen.findByRole("heading", { name: "无法确认登录状态" })).toBeInTheDocument();
    expect(screen.getByText("认证服务暂时不可用，请稍后重试或返回登录页。")).toBeInTheDocument();
  });

  it("redirects to /login when authenticated current-user cache becomes empty", async () => {
    setupAuthResponse(buildAppUser("admin"));

    const { queryClient } = renderRoute("/settings/providers");

    expect(await screen.findByRole("heading", { name: "提供商配置" })).toBeInTheDocument();

    await act(async () => {
      queryClient.setQueryData(queryKeys.auth.me, null);
    });

    expect(await screen.findByRole("heading", { name: "登录" })).toBeInTheDocument();
    expect(useSessionStore.getState().status).toBe("expired");
  });

  it("redirects legacy /users to /403 for standard users", async () => {
    setupAuthResponse(buildAppUser("user", { id: 2, username: "user" }));

    const { history } = renderRoute("/users");

    expect(await screen.findByRole("heading", { name: "403" })).toBeInTheDocument();
    expect(history.location.pathname).toBe("/403");
  });

  it("redirects legacy /users to /admin/users for admins", async () => {
    setupAuthResponse(buildAppUser("admin"));

    const { history } = renderRoute("/users");

    expect(await screen.findByRole("heading", { name: "用户管理" })).toBeInTheDocument();
    expect(history.location.pathname).toBe("/admin/users");
  });

  it("redirects /settings to the admin default section", async () => {
    setupAuthResponse(buildAppUser("admin"));

    const { history } = renderRoute("/settings");

    expect(await screen.findByRole("heading", { name: "提供商配置" })).toBeInTheDocument();
    expect(history.location.pathname).toBe("/settings/providers");
  });

  it("bootstraps refresh-cookie sessions before loading protected settings subroutes", async () => {
    const user = buildAppUser("admin");
    setupAuthResponse(user);
    overrideHandler(
      http.get("*/api/auth/me", ({ request }) => {
        if (request.headers.get("authorization") !== "Bearer test-token") {
          return HttpResponse.json(
            {
              success: false,
              data: null,
              error: { code: "unauthorized", message: "Authentication required." },
            },
            { status: 401 },
          );
        }

        return apiResponse(user);
      }),
    );

    const { history } = renderRoute("/settings/providers");

    expect(await screen.findByRole("heading", { name: "提供商配置" })).toBeInTheDocument();
    expect(history.location.pathname).toBe("/settings/providers");
  });

  it("redirects /settings to the standard-user default section", async () => {
    setupAuthResponse(buildAppUser("user", { id: 2, username: "user" }));

    const { history } = renderRoute("/settings");

    expect(await screen.findByRole("heading", { name: "偏好与外观" })).toBeInTheDocument();
    expect(history.location.pathname).toBe("/settings/preferences");
  });

  it("keeps standard users on personal settings sections and hides admin-only entries", async () => {
    setupAuthResponse(buildAppUser("user", { id: 2, username: "user" }));

    renderRoute("/settings/preferences");

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

  it("redirects standard users away from admin-only settings sections", async () => {
    setupAuthResponse(buildAppUser("user", { id: 2, username: "user" }));

    const { history } = renderRoute("/settings/providers");

    expect(await screen.findByRole("heading", { name: "偏好与外观" })).toBeInTheDocument();
    expect(history.location.pathname).toBe("/settings/preferences");
  });

  it("restores the last visited chat session from /chat", async () => {
    window.localStorage.setItem(LAST_VISITED_CHAT_SESSION_STORAGE_KEY, "2");
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

    const { history } = renderRoute("/chat");

    expect(await screen.findByRole("heading", { name: "Session B" })).toBeInTheDocument();
    expect(history.location.pathname).toBe("/chat/2");
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

    const { history } = renderRoute("/chat");

    expect(await screen.findByRole("heading", { name: "Session B" })).toBeInTheDocument();
    expect(history.location.pathname).toBe("/chat/2");
    await waitFor(() =>
      expect(window.localStorage.getItem(LAST_VISITED_CHAT_SESSION_STORAGE_KEY)).toBe("2"),
    );
  });

  it("keeps /chat as an empty entry state when there are no sessions", async () => {
    window.localStorage.setItem(LAST_VISITED_CHAT_SESSION_STORAGE_KEY, "99");
    setupAuthenticatedChatWorkspaceResponse({ sessions: [] });

    const { history } = renderRoute("/chat");

    expect(await screen.findByRole("heading", { name: "先开始一个会话" })).toBeInTheDocument();
    expect(history.location.pathname).toBe("/chat");
    await waitFor(() =>
      expect(window.localStorage.getItem(LAST_VISITED_CHAT_SESSION_STORAGE_KEY)).toBeNull(),
    );
  });

  it("renders a concrete session from /chat/:sessionId", async () => {
    setupAuthenticatedChatWorkspaceResponse({
      sessions: [
        { id: 1, title: "Session A", reasoning_mode: "default" },
        { id: 2, title: "Session B", reasoning_mode: "default" },
      ],
      messagesBySession: {
        2: [
          { id: 10, role: "user", content: "问题", status: "succeeded", sources_json: [] },
          { id: 11, role: "assistant", content: "答案", status: "succeeded", sources_json: [] },
        ],
      },
    });

    const { history } = renderRoute("/chat/2");

    expect(await screen.findByRole("heading", { name: "Session B" })).toBeInTheDocument();
    expect(history.location.pathname).toBe("/chat/2");
  });

  it("redirects invalid chat session params back to /chat", async () => {
    setupAuthenticatedChatWorkspaceResponse({
      sessions: [{ id: 1, title: "Session A", reasoning_mode: "default" }],
    });

    const { history } = renderRoute("/chat/not-a-number");

    expect(await screen.findByRole("heading", { name: "Session A" })).toBeInTheDocument();
    expect(history.location.pathname).toBe("/chat/1");
  });

  it("redirects stale chat session ids back to /chat", async () => {
    setupAuthenticatedChatWorkspaceResponse({
      sessions: [{ id: 1, title: "Session A", reasoning_mode: "default" }],
    });

    const { history } = renderRoute("/chat/99");

    expect(await screen.findByRole("heading", { name: "Session A" })).toBeInTheDocument();
    expect(history.location.pathname).toBe("/chat/1");
  });

  it("redirects authenticated users from / to /chat", async () => {
    setupAuthResponse(buildAppUser("admin"));

    const { history } = renderRoute("/");

    expect(await screen.findByRole("button", { name: "新建会话" })).toBeInTheDocument();
    expect(history.location.pathname).toBe("/chat/1");
  });
});
