import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";

import { queryKeys } from "@/lib/api/query-keys";
import { useSessionStore } from "@/lib/auth/session-store";
import { AppProviders } from "@/providers/app-providers";
import { AppRouter } from "@/router";
import { jsonResponse } from "@/test/http";

const LAST_VISITED_CHAT_SESSION_STORAGE_KEY = "knowledge-chatbox-last-chat-session-id";
const DEFAULT_SYSTEM_PROMPT = [
  "你是 Knowledge Chatbox 的 AI 助手。",
  "请基于用户提供的问题、会话历史和检索到的资源内容，给出准确、简洁、可执行的回答。",
  "优先引用资源事实，不要编造未在上下文中出现的信息。",
  "永远回复中文。",
].join("\n");
const AUTHENTICATED_ADMIN = {
  id: 1,
  username: "admin",
  role: "admin",
  status: "active",
  theme_preference: "system",
} as const;

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

function mockAuthResponse(data: unknown, ok = true, status = 200) {
  return vi.fn().mockImplementation((input: string) => {
    if (input.endsWith("/api/auth/bootstrap")) {
      if (!ok && status === 401) {
        return Promise.resolve(
          jsonResponse({
            success: true,
            data: {
              authenticated: false,
              access_token: null,
              expires_in: null,
              token_type: "Bearer",
              user: null,
            },
            error: null,
          }),
        );
      }

      return Promise.resolve(
        jsonResponse({
          success: true,
          data: {
            authenticated: true,
            access_token: "refreshed-token",
            expires_in: 900,
            token_type: "Bearer",
            user: data,
          },
          error: null,
        }),
      );
    }

    if (input.endsWith("/api/auth/refresh")) {
      if (!ok && status === 401) {
        return Promise.resolve(
          jsonResponse(
            {
              success: false,
              data: null,
              error: { code: "unauthorized", message: "Authentication required." },
            },
            { status: 401, statusText: "Unauthorized" },
          ),
        );
      }

      return Promise.resolve(
        jsonResponse({
          success: true,
          data: {
            access_token: "refreshed-token",
            expires_in: 900,
            token_type: "Bearer",
          },
          error: null,
        }),
      );
    }

    if (input.endsWith("/api/auth/me")) {
      return Promise.resolve(
        jsonResponse(
          { success: ok, data, error: ok ? null : { code: "unauthorized" } },
          { status },
        ),
      );
    }

    if (input.endsWith("/api/settings")) {
      return Promise.resolve(
        jsonResponse({
          success: true,
          data: {
            id: 1,
            provider_profiles: {
              openai: {
                api_key: "",
                base_url: "https://api.openai.com/v1",
                chat_model: "gpt-5.4",
                embedding_model: "text-embedding-3-small",
                vision_model: "gpt-5.4",
              },
              anthropic: {
                api_key: null,
                base_url: "https://api.anthropic.com",
                chat_model: "claude-sonnet-4-5",
                vision_model: "claude-sonnet-4-5",
              },
              voyage: {
                api_key: null,
                base_url: "https://api.voyageai.com/v1",
                embedding_model: "voyage-3.5",
              },
              ollama: {
                base_url: "http://localhost:11434",
                chat_model: "qwen3.5:4b",
                embedding_model: "nomic-embed-text",
                vision_model: "qwen3.5:4b",
              },
            },
            response_route: {
              provider: "openai",
              model: "gpt-5.4",
            },
            embedding_route: {
              provider: "openai",
              model: "text-embedding-3-small",
            },
            pending_embedding_route: null,
            vision_route: {
              provider: "openai",
              model: "gpt-5.4",
            },
            system_prompt: DEFAULT_SYSTEM_PROMPT,
            provider_timeout_seconds: 60,
            active_index_generation: 3,
            building_index_generation: null,
            index_rebuild_status: "idle",
            rebuild_started: false,
            reindex_required: false,
          },
          error: null,
        }),
      );
    }

    if (input.endsWith("/api/chat/sessions")) {
      return Promise.resolve(
        jsonResponse({
          success: true,
          data: [{ id: 1, title: "Session A", reasoning_mode: "default" }],
          error: null,
        }),
      );
    }

    if (input.endsWith("/api/chat/profile")) {
      return Promise.resolve(
        jsonResponse({
          success: true,
          data: { provider: "openai", model: "gpt-5.4" },
          error: null,
        }),
      );
    }

    return Promise.resolve(jsonResponse({ success: true, data: [], error: null }));
  });
}

function mockAuthenticatedChatWorkspaceResponse({
  sessions = [{ id: 1, title: "Session A", reasoning_mode: "default" }],
  messagesBySession = {},
}: {
  sessions?: Array<{ id: number; title: string; reasoning_mode: string }>;
  messagesBySession?: Record<number, unknown[]>;
} = {}) {
  return vi.fn().mockImplementation((input: string) => {
    if (input.endsWith("/api/auth/bootstrap")) {
      return Promise.resolve(
        jsonResponse({
          success: true,
          data: {
            authenticated: true,
            access_token: "refreshed-token",
            expires_in: 900,
            token_type: "Bearer",
            user: AUTHENTICATED_ADMIN,
          },
          error: null,
        }),
      );
    }

    if (input.endsWith("/api/auth/refresh")) {
      return Promise.resolve(
        jsonResponse({
          success: true,
          data: {
            access_token: "refreshed-token",
            expires_in: 900,
            token_type: "Bearer",
          },
          error: null,
        }),
      );
    }

    if (input.endsWith("/api/auth/me")) {
      return Promise.resolve(
        jsonResponse({
          success: true,
          data: AUTHENTICATED_ADMIN,
          error: null,
        }),
      );
    }

    if (input.endsWith("/api/settings")) {
      return Promise.resolve(
        jsonResponse({
          success: true,
          data: {
            id: 1,
            provider_profiles: {
              openai: {
                api_key: "",
                base_url: "https://api.openai.com/v1",
                chat_model: "gpt-5.4",
                embedding_model: "text-embedding-3-small",
                vision_model: "gpt-5.4",
              },
              anthropic: {
                api_key: null,
                base_url: "https://api.anthropic.com",
                chat_model: "claude-sonnet-4-5",
                vision_model: "claude-sonnet-4-5",
              },
              voyage: {
                api_key: null,
                base_url: "https://api.voyageai.com/v1",
                embedding_model: "voyage-3.5",
              },
              ollama: {
                base_url: "http://localhost:11434",
                chat_model: "qwen3.5:4b",
                embedding_model: "nomic-embed-text",
                vision_model: "qwen3.5:4b",
              },
            },
            response_route: {
              provider: "openai",
              model: "gpt-5.4",
            },
            embedding_route: {
              provider: "openai",
              model: "text-embedding-3-small",
            },
            pending_embedding_route: null,
            vision_route: {
              provider: "openai",
              model: "gpt-5.4",
            },
            system_prompt: DEFAULT_SYSTEM_PROMPT,
            provider_timeout_seconds: 60,
            active_index_generation: 3,
            building_index_generation: null,
            index_rebuild_status: "idle",
            rebuild_started: false,
            reindex_required: false,
          },
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

    if (input.endsWith("/api/chat/profile")) {
      return Promise.resolve(
        jsonResponse({
          success: true,
          data: { configured: true, provider: "openai", model: "gpt-5.4" },
          error: null,
        }),
      );
    }

    const messageRoute = input.match(/\/api\/chat\/sessions\/(\d+)\/messages$/);
    if (messageRoute) {
      const sessionId = Number(messageRoute[1]);
      return Promise.resolve(
        jsonResponse({
          success: true,
          data: messagesBySession[sessionId] ?? [],
          error: null,
        }),
      );
    }

    return Promise.resolve(jsonResponse({ success: true, data: [], error: null }));
  });
}

function mockMobileViewport() {
  Object.defineProperty(window, "innerWidth", {
    configurable: true,
    writable: true,
    value: 390,
  });

  window.matchMedia = vi.fn().mockImplementation((query: string) => ({
    matches: query.includes("767px"),
    media: query,
    onchange: null,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    addListener: vi.fn(),
    removeListener: vi.fn(),
    dispatchEvent: vi.fn(),
  }));
}

function mockDesktopViewport() {
  Object.defineProperty(window, "innerWidth", {
    configurable: true,
    writable: true,
    value: 1280,
  });

  window.matchMedia = vi.fn().mockImplementation((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    addListener: vi.fn(),
    removeListener: vi.fn(),
    dispatchEvent: vi.fn(),
  }));
}

describe("AppRouter", () => {
  beforeEach(() => {
    localStorage.clear();
    document.documentElement.className = "";
    useSessionStore.getState().reset();
    mockDesktopViewport();
  });

  it("defaults to zh-CN copy", async () => {
    vi.stubGlobal("fetch", mockAuthResponse(null, false, 401));

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
    vi.stubGlobal("fetch", mockAuthResponse(null, false, 401));

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
    vi.stubGlobal("fetch", mockAuthResponse(AUTHENTICATED_ADMIN));
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
    vi.stubGlobal(
      "fetch",
      vi.fn().mockImplementation((input: string) => {
        if (input.endsWith("/api/auth/bootstrap")) {
          return Promise.resolve(new Response("", { status: 500, statusText: "Server Error" }));
        }

        if (input.endsWith("/api/auth/refresh")) {
          return Promise.resolve(new Response("", { status: 500, statusText: "Server Error" }));
        }

        if (input.endsWith("/api/auth/me")) {
          return Promise.resolve(new Response("", { status: 500, statusText: "Server Error" }));
        }

        return Promise.resolve(jsonResponse({ success: true, data: [], error: null }));
      }),
    );

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
    vi.stubGlobal(
      "fetch",
      vi.fn().mockImplementation((input: string) => {
        if (input.endsWith("/api/auth/bootstrap")) {
          return Promise.resolve(
            jsonResponse({
              success: true,
              data: {
                authenticated: false,
                access_token: null,
                expires_in: null,
                token_type: "Bearer",
                user: null,
              },
              error: null,
            }),
          );
        }

        if (input.endsWith("/api/auth/me")) {
          return Promise.resolve(new Response("", { status: 500, statusText: "Server Error" }));
        }

        return Promise.resolve(jsonResponse({ success: true, data: [], error: null }));
      }),
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
    vi.stubGlobal("fetch", mockAuthResponse(AUTHENTICATED_ADMIN));

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
    vi.stubGlobal(
      "fetch",
      mockAuthResponse({
        id: 1,
        username: "admin",
        role: "admin",
        status: "active",
        theme_preference: "system",
      }),
    );

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

    fireEvent.pointerDown(screen.getByRole("button", { name: "打开账户菜单" }));

    expect(await screen.findByRole("menuitem", { name: "系统设置" })).toHaveAttribute(
      "href",
      "/settings",
    );
    expect(screen.getByRole("menuitem", { name: "退出登录" })).toBeInTheDocument();
  });

  it("restores the last visited session when opening /chat", async () => {
    window.localStorage.setItem(LAST_VISITED_CHAT_SESSION_STORAGE_KEY, "2");
    vi.stubGlobal(
      "fetch",
      mockAuthenticatedChatWorkspaceResponse({
        sessions: [
          { id: 2, title: "Session B", reasoning_mode: "default" },
          { id: 1, title: "Session A", reasoning_mode: "default" },
        ],
        messagesBySession: {
          2: [
            {
              id: 10,
              role: "user",
              content: "问题",
              status: "succeeded",
              sources_json: [],
            },
            {
              id: 11,
              role: "assistant",
              content: "答案",
              status: "succeeded",
              sources_json: [],
            },
          ],
        },
      }),
    );

    render(
      <MemoryRouter initialEntries={["/chat"]}>
        <AppProviders>
          <AppRouter />
        </AppProviders>
      </MemoryRouter>,
    );

    expect(await screen.findByRole("heading", { name: "Session B" })).toBeInTheDocument();
    expect(await screen.findByText("答案")).toBeInTheDocument();
    await waitFor(() =>
      expect(window.localStorage.getItem(LAST_VISITED_CHAT_SESSION_STORAGE_KEY)).toBe("2"),
    );
  });

  it("falls back to the most recent session when the stored session is stale", async () => {
    window.localStorage.setItem(LAST_VISITED_CHAT_SESSION_STORAGE_KEY, "99");
    const fetchSpy = mockAuthenticatedChatWorkspaceResponse({
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
    vi.stubGlobal("fetch", fetchSpy);

    render(
      <MemoryRouter initialEntries={["/chat"]}>
        <AppProviders>
          <AppRouter />
        </AppProviders>
      </MemoryRouter>,
    );

    expect(await screen.findByRole("heading", { name: "Session B" })).toBeInTheDocument();
    expect(await screen.findByText("最近会话答案")).toBeInTheDocument();
    await waitFor(() =>
      expect(window.localStorage.getItem(LAST_VISITED_CHAT_SESSION_STORAGE_KEY)).toBe("2"),
    );
    expect(fetchSpy).not.toHaveBeenCalledWith(
      expect.stringContaining("/api/chat/sessions/99/messages"),
    );
  });

  it("keeps /chat as an empty entry state when there are no sessions", async () => {
    window.localStorage.setItem(LAST_VISITED_CHAT_SESSION_STORAGE_KEY, "99");
    vi.stubGlobal(
      "fetch",
      mockAuthenticatedChatWorkspaceResponse({
        sessions: [],
      }),
    );

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
    vi.stubGlobal(
      "fetch",
      vi.fn().mockImplementation((input: string) => {
        if (input.endsWith("/api/auth/refresh")) {
          return Promise.resolve(
            jsonResponse({
              success: true,
              data: {
                access_token: "refreshed-token",
                expires_in: 900,
                token_type: "Bearer",
              },
              error: null,
            }),
          );
        }

        if (input.endsWith("/api/auth/me")) {
          return Promise.resolve(
            jsonResponse({
              success: true,
              data: {
                id: 1,
                username: "admin",
                role: "admin",
                status: "active",
                theme_preference: "system",
              },
              error: null,
            }),
          );
        }

        if (input.endsWith("/api/chat/sessions")) {
          return Promise.resolve(
            jsonResponse({
              success: true,
              data: [
                { id: 1, title: "Session A", reasoning_mode: "default" },
                { id: 2, title: "Session B", reasoning_mode: "default" },
              ],
              error: null,
            }),
          );
        }

        if (input.endsWith("/api/chat/profile")) {
          return Promise.resolve(
            jsonResponse({
              success: true,
              data: { configured: true, provider: "openai", model: "gpt-5.4" },
              error: null,
            }),
          );
        }

        if (input.endsWith("/api/chat/sessions/2/messages")) {
          return Promise.resolve(
            jsonResponse({
              success: true,
              data: [
                {
                  id: 10,
                  role: "user",
                  content: "问题",
                  status: "succeeded",
                  sources_json: [],
                },
                {
                  id: 11,
                  role: "assistant",
                  content: "答案",
                  status: "succeeded",
                  sources_json: [],
                },
              ],
              error: null,
            }),
          );
        }

        return Promise.resolve(jsonResponse({ success: true, data: [], error: null }));
      }),
    );

    render(
      <MemoryRouter initialEntries={["/chat/2"]}>
        <AppProviders>
          <AppRouter />
        </AppProviders>
      </MemoryRouter>,
    );

    expect(await screen.findByRole("heading", { name: "Session B" })).toBeInTheDocument();
    expect(screen.getByText("答案")).toBeInTheDocument();
  });

  it("redirects authenticated users from root to the chat workspace", async () => {
    vi.stubGlobal(
      "fetch",
      mockAuthResponse({
        id: 1,
        username: "admin",
        role: "admin",
        status: "active",
        theme_preference: "system",
      }),
    );

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
    vi.stubGlobal(
      "fetch",
      mockAuthResponse({
        id: 1,
        username: "admin",
        role: "admin",
        status: "active",
        theme_preference: "system",
      }),
    );

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

    fireEvent.pointerDown(screen.getByRole("button", { name: "打开账户菜单" }));

    expect(await screen.findByRole("menuitem", { name: "退出登录" })).toBeInTheDocument();
  });

  it("shows the standard workspace sidebar alongside the page content on desktop routes", async () => {
    vi.stubGlobal(
      "fetch",
      mockAuthResponse({
        id: 1,
        username: "admin",
        role: "admin",
        status: "active",
        theme_preference: "system",
      }),
    );

    render(
      <MemoryRouter initialEntries={["/knowledge"]}>
        <AppProviders>
          <AppRouter />
        </AppProviders>
      </MemoryRouter>,
    );

    expect(await screen.findByRole("heading", { name: "资源" })).toBeInTheDocument();

    const layout = screen.getByTestId("standard-desktop-layout");
    const sidebar = screen.getByRole("complementary", { name: "工作台侧栏" });
    const knowledgeLink = screen.getByRole("link", { name: "资源" });

    expect(layout).toBeInTheDocument();
    expect(sidebar).toBeInTheDocument();
    expect(knowledgeLink).toHaveAttribute("href", "/knowledge");
    expect(screen.getByRole("main")).toContainElement(
      screen.getByRole("heading", { name: "资源" }),
    );
  });

  it("keeps the settings content reachable on mobile layouts", async () => {
    mockMobileViewport();
    vi.stubGlobal(
      "fetch",
      mockAuthResponse({
        id: 1,
        username: "admin",
        role: "admin",
        status: "active",
        theme_preference: "system",
      }),
    );

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
    const fetchMock = mockAuthResponse({
      id: 2,
      username: "user",
      role: "user",
      status: "active",
      theme_preference: "system",
    });
    vi.stubGlobal("fetch", fetchMock);

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
    const settingsCalls = fetchMock.mock.calls.filter(([url]) =>
      String(url).endsWith("/api/settings"),
    );
    expect(settingsCalls).toHaveLength(0);
  });

  it("shows a forbidden page for standard users visiting /users", async () => {
    vi.stubGlobal(
      "fetch",
      mockAuthResponse({
        id: 2,
        username: "user",
        role: "user",
        status: "active",
        theme_preference: "system",
      }),
    );

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
    vi.stubGlobal(
      "fetch",
      mockAuthResponse({
        id: 1,
        username: "admin",
        role: "admin",
        status: "active",
        theme_preference: "system",
      }),
    );

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

    fireEvent.pointerDown(screen.getByRole("button", { name: "Open account menu" }));

    expect(await screen.findByRole("menuitem", { name: "System settings" })).toHaveAttribute(
      "href",
      "/settings",
    );
    expect(screen.getByRole("menuitem", { name: "Log Out" })).toBeInTheDocument();
  });

  it("applies stored theme preference", async () => {
    localStorage.setItem("knowledge-chatbox-theme", "dark");
    vi.stubGlobal("fetch", mockAuthResponse(null, false, 401));

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
    vi.stubGlobal(
      "fetch",
      mockAuthResponse({
        id: 1,
        username: "admin",
        role: "admin",
        status: "active",
        theme_preference: "light",
      }),
    );

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
});
