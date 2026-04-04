import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

import { i18n } from "@/i18n";
import { THEME_SYNC_ON_LOGIN_STORAGE_KEY } from "@/lib/config/constants";
import { useSessionStore } from "@/lib/auth/session-store";
import { setAccessToken } from "@/lib/auth/token-store";
import { AppProviders } from "@/providers/app-providers";
import { AppRouter } from "@/router";
import { buildAppSettings, buildAppUser } from "@/test/fixtures/app";
import { createAuthFetchMock, type FetchHandler } from "@/test/auth";
import { jsonResponse } from "@/test/http";

const sonnerMocks = vi.hoisted(() => ({
  error: vi.fn(),
  success: vi.fn(),
}));

vi.mock("sonner", async (importOriginal) => {
  const actual = await importOriginal<typeof import("sonner")>();

  return {
    ...actual,
    toast: sonnerMocks,
  };
});

function authenticatedFetch(
  role: "admin" | "user" | null = null,
  options?: { loginError?: { code?: string; message?: string; status: number } },
) {
  const user = role ? buildAppUser(role) : null;
  const extraHandlers: FetchHandler[] = [
    (input, init) => {
      if (input.endsWith("/api/auth/login")) {
        const loginError = options?.loginError;
        if (loginError) {
          return Promise.resolve(
            jsonResponse(
              {
                success: false,
                data: null,
                error: {
                  code: loginError.code,
                  message: loginError.message,
                },
              },
              { status: loginError.status },
            ),
          );
        }

        return Promise.resolve(
          jsonResponse({
            success: true,
            data: {
              access_token: "login-token",
              expires_in: 900,
              token_type: "Bearer",
              user: buildAppUser("admin"),
            },
            error: null,
          }),
        );
      }

      if (input.endsWith("/api/auth/change-password")) {
        return Promise.resolve(
          jsonResponse({
            success: true,
            data: buildAppUser("admin"),
            error: null,
          }),
        );
      }

      if (input.endsWith("/api/auth/preferences")) {
        const requestBody: { theme_preference: "dark" | "light" | "system" } =
          typeof init?.body === "string"
            ? (JSON.parse(init.body) as { theme_preference: "dark" | "light" | "system" })
            : { theme_preference: "dark" };

        return Promise.resolve(
          jsonResponse({
            success: true,
            data: buildAppUser("admin", {
              theme_preference: requestBody.theme_preference,
            }),
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
            data: { configured: true, provider: "openai", model: "gpt-5.4" },
            error: null,
          }),
        );
      }

      return undefined;
    },
  ];

  return createAuthFetchMock({
    user,
    status: user ? 200 : 401,
    settings: buildAppSettings({
      active_index_generation: 1,
      provider_profiles: {
        openai: {
          api_key: "",
        },
        ollama: {
          base_url: "http://localhost:11434",
        },
      },
    }),
    extraHandlers,
  });
}

describe("login page", () => {
  beforeEach(async () => {
    localStorage.clear();
    setAccessToken(null);
    useSessionStore.getState().reset();
    sonnerMocks.error.mockReset();
    sonnerMocks.success.mockReset();
    await i18n.changeLanguage("zh-CN");
  });

  it("validates required login fields before submitting", async () => {
    const fetchMock = authenticatedFetch(null);
    vi.stubGlobal("fetch", fetchMock);

    render(
      <MemoryRouter initialEntries={["/login"]}>
        <AppProviders>
          <AppRouter />
        </AppProviders>
      </MemoryRouter>,
    );

    fireEvent.click(await screen.findByRole("button", { name: "登录" }));

    expect(await screen.findByText("请输入用户名和密码。")).toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalledWith(
      expect.stringMatching(/\/api\/auth\/login$/),
      expect.objectContaining({ method: "POST" }),
    );
  });

  it("keeps login validation visible until the corrected fields blur", async () => {
    const fetchMock = authenticatedFetch(null);
    vi.stubGlobal("fetch", fetchMock);

    render(
      <MemoryRouter initialEntries={["/login"]}>
        <AppProviders>
          <AppRouter />
        </AppProviders>
      </MemoryRouter>,
    );

    fireEvent.click(await screen.findByRole("button", { name: "登录" }));

    expect(await screen.findByText("请输入用户名和密码。")).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText("用户名"), {
      target: { value: "admin" },
    });
    expect(screen.getByText("请输入用户名和密码。")).toBeInTheDocument();

    fireEvent.blur(screen.getByLabelText("用户名"));
    expect(screen.getByText("请输入用户名和密码。")).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText("密码"), {
      target: { value: "secret-123" },
    });
    expect(screen.getByText("请输入用户名和密码。")).toBeInTheDocument();

    fireEvent.blur(screen.getByLabelText("密码"));

    await waitFor(() => {
      expect(screen.queryByText("请输入用户名和密码。")).not.toBeInTheDocument();
    });
    expect(fetchMock).not.toHaveBeenCalledWith(
      expect.stringMatching(/\/api\/auth\/login$/),
      expect.objectContaining({ method: "POST" }),
    );
  });

  it("shows login page for unauthenticated users", async () => {
    vi.stubGlobal("fetch", authenticatedFetch(null));

    render(
      <MemoryRouter initialEntries={["/chat"]}>
        <AppProviders>
          <AppRouter />
        </AppProviders>
      </MemoryRouter>,
    );

    expect(await screen.findByRole("heading", { name: "登录" })).toBeInTheDocument();
    expect(screen.getByRole("img", { name: "Knowledge Chatbox 标志" })).toBeInTheDocument();
    expect(screen.getByText("把知识、对话和资源收进一个工作台")).toBeInTheDocument();
    expect(screen.getByText("登录后工作路径")).toBeInTheDocument();
    expect(screen.getByText("围绕当前资源持续提问，保留上下文切换节奏。")).toBeInTheDocument();
    const workbenchList = screen.getByRole("list", { name: "登录后工作路径" });
    expect(workbenchList).toBeInTheDocument();
    expect(screen.getAllByRole("listitem")).toHaveLength(3);
    expect(screen.queryByText("访问边界")).not.toBeInTheDocument();
    expect(screen.getByText("受控登录")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "查看工作台说明" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "语言" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "主题" })).toBeInTheDocument();
  });

  it("exposes distinct intro and login entry regions for unauthenticated users", async () => {
    vi.stubGlobal("fetch", authenticatedFetch(null));

    render(
      <MemoryRouter initialEntries={["/login"]}>
        <AppProviders>
          <AppRouter />
        </AppProviders>
      </MemoryRouter>,
    );

    const introRegion = await screen.findByLabelText("工作台入口说明");
    const loginRegion = screen.getByLabelText("登录入口");

    expect(within(introRegion).getByText("登录后工作路径")).toBeInTheDocument();
    expect(within(loginRegion).getByRole("heading", { name: "登录" })).toBeInTheDocument();
    expect(within(loginRegion).getByRole("button", { name: "登录" })).toBeInTheDocument();
  });

  it("keeps vertical scrolling available on mobile login layouts", async () => {
    vi.stubGlobal("fetch", authenticatedFetch(null));

    render(
      <MemoryRouter initialEntries={["/login"]}>
        <AppProviders>
          <AppRouter />
        </AppProviders>
      </MemoryRouter>,
    );

    const loginHeading = await screen.findByRole("heading", { name: "登录" });
    const loginPageMain = loginHeading.closest("main");

    expect(loginPageMain).not.toBeNull();
    expect(loginPageMain).toHaveClass("overflow-x-hidden");
    expect(loginPageMain).not.toHaveClass("overflow-hidden");
  });

  it("opens workspace about dialog from the help entry", async () => {
    vi.stubGlobal("fetch", authenticatedFetch(null));

    render(
      <MemoryRouter initialEntries={["/login"]}>
        <AppProviders>
          <AppRouter />
        </AppProviders>
      </MemoryRouter>,
    );

    fireEvent.click(await screen.findByRole("button", { name: "查看工作台说明" }));

    expect(await screen.findByRole("heading", { name: "关于这个工作台" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "关闭" })).toBeInTheDocument();
    expect(
      screen.getByText(
        "管理员负责初始化系统、配置 provider 与维护资源；普通用户主要浏览资源、发起问答和查看来源。",
      ),
    ).toBeInTheDocument();
    expect(screen.getByText("本地优先、统一工作台、受控访问")).toBeInTheDocument();
  });

  it("redirects to chat after login success", async () => {
    const fetchMock = authenticatedFetch(null);
    vi.stubGlobal("fetch", fetchMock);

    render(
      <MemoryRouter initialEntries={["/login"]}>
        <AppProviders>
          <AppRouter />
        </AppProviders>
      </MemoryRouter>,
    );

    fireEvent.change(await screen.findByLabelText("用户名"), {
      target: { value: "admin" },
    });
    fireEvent.change(screen.getByLabelText("密码"), {
      target: { value: "secret" },
    });
    fireEvent.click(screen.getByRole("button", { name: "登录" }));

    expect(await screen.findByRole("button", { name: "新建会话" })).toBeInTheDocument();
  });

  it("keeps the login-page theme after sign-in and syncs it to account preferences", async () => {
    const fetchMock = authenticatedFetch(null);
    vi.stubGlobal("fetch", fetchMock);

    render(
      <MemoryRouter initialEntries={["/login"]}>
        <AppProviders>
          <AppRouter />
        </AppProviders>
      </MemoryRouter>,
    );

    window.sessionStorage.setItem(THEME_SYNC_ON_LOGIN_STORAGE_KEY, "dark");
    fireEvent.change(screen.getByLabelText("用户名"), {
      target: { value: "admin" },
    });
    fireEvent.change(screen.getByLabelText("密码"), {
      target: { value: "secret" },
    });
    fireEvent.click(screen.getByRole("button", { name: "登录" }));

    await waitFor(() => {
      const preferencesCall = fetchMock.mock.calls.find(([url]) =>
        String(url).endsWith("/api/auth/preferences"),
      );

      expect(preferencesCall).toBeDefined();
      expect(preferencesCall?.[1]).toEqual(
        expect.objectContaining({
          body: JSON.stringify({ theme_preference: "dark" }),
          method: "PATCH",
        }),
      );
    });
    expect(await screen.findByRole("button", { name: "新建会话" })).toBeInTheDocument();
    expect(document.documentElement).toHaveClass("dark");
    expect(window.localStorage.getItem("knowledge-chatbox-theme")).toBe("dark");
  });

  it("does not block sign-in navigation while theme preference sync is pending", async () => {
    let resolvePreferencesRequest: (() => void) | undefined;
    const fetchMock = vi.fn().mockImplementation((input: string, _init?: RequestInit) => {
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

      if (input.endsWith("/api/auth/refresh")) {
        return Promise.resolve(
          jsonResponse(
            { success: false, data: null, error: { code: "unauthorized" } },
            { status: 401 },
          ),
        );
      }

      if (input.endsWith("/api/auth/me")) {
        return Promise.resolve(
          jsonResponse({
            success: true,
            data: buildAppUser("admin"),
            error: null,
          }),
        );
      }

      if (input.endsWith("/api/auth/login")) {
        return Promise.resolve(
          jsonResponse({
            success: true,
            data: {
              access_token: "login-token",
              expires_in: 900,
              token_type: "Bearer",
              user: buildAppUser("admin"),
            },
            error: null,
          }),
        );
      }

      if (input.endsWith("/api/auth/preferences")) {
        return new Promise((resolve) => {
          resolvePreferencesRequest = () =>
            resolve(
              jsonResponse({
                success: true,
                data: buildAppUser("admin", { theme_preference: "dark" }),
                error: null,
              }),
            );
        });
      }

      if (input.endsWith("/api/settings")) {
        return Promise.resolve(
          jsonResponse({
            success: true,
            data: buildAppSettings(),
            error: null,
          }),
        );
      }

      return Promise.resolve(jsonResponse({ success: true, data: [], error: null }));
    });
    vi.stubGlobal("fetch", fetchMock);

    render(
      <MemoryRouter initialEntries={["/login"]}>
        <AppProviders>
          <AppRouter />
        </AppProviders>
      </MemoryRouter>,
    );

    fireEvent.pointerDown(await screen.findByRole("button", { name: "主题" }));
    fireEvent.click(await screen.findByText("深色"));
    fireEvent.change(screen.getByLabelText("用户名"), {
      target: { value: "admin" },
    });
    fireEvent.change(screen.getByLabelText("密码"), {
      target: { value: "secret" },
    });
    fireEvent.click(screen.getByRole("button", { name: "登录" }));

    await waitFor(() => {
      expect(
        fetchMock.mock.calls.some(([url]) => String(url).endsWith("/api/auth/preferences")),
      ).toBe(true);
    });
    expect(await screen.findByRole("button", { name: "新建会话" })).toBeInTheDocument();

    resolvePreferencesRequest?.();
  });

  it("prevents duplicate login submissions while pending", async () => {
    let resolveLoginRequest: (() => void) | undefined;
    const fetchMock = vi.fn().mockImplementation((input: string) => {
      if (input.endsWith("/api/auth/refresh")) {
        return Promise.resolve(
          jsonResponse(
            { success: false, data: null, error: { code: "unauthorized" } },
            { status: 401 },
          ),
        );
      }

      if (input.endsWith("/api/auth/me")) {
        return Promise.resolve(
          jsonResponse(
            { success: false, data: null, error: { code: "unauthorized" } },
            { status: 401 },
          ),
        );
      }

      if (input.endsWith("/api/auth/login")) {
        return new Promise((resolve) => {
          resolveLoginRequest = () =>
            resolve(
              jsonResponse({
                success: true,
                data: {
                  access_token: "login-token",
                  expires_in: 900,
                  token_type: "Bearer",
                  user: buildAppUser("admin"),
                },
                error: null,
              }),
            );
        });
      }

      return Promise.resolve(jsonResponse({ success: true, data: [], error: null }));
    });
    vi.stubGlobal("fetch", fetchMock);

    render(
      <MemoryRouter initialEntries={["/login"]}>
        <AppProviders>
          <AppRouter />
        </AppProviders>
      </MemoryRouter>,
    );

    fireEvent.change(await screen.findByLabelText("用户名"), {
      target: { value: "admin" },
    });
    fireEvent.change(screen.getByLabelText("密码"), {
      target: { value: "secret" },
    });

    const submitButton = screen.getByRole("button", { name: "登录" });
    fireEvent.click(submitButton);
    fireEvent.click(submitButton);

    expect(await screen.findByRole("button", { name: "登录中..." })).toBeDisabled();
    expect(
      fetchMock.mock.calls.filter(([url]) => String(url).endsWith("/api/auth/login")),
    ).toHaveLength(1);

    resolveLoginRequest?.();

    expect(await screen.findByRole("button", { name: "新建会话" })).toBeInTheDocument();
  });

  it("shows an actionable error message after login failure", async () => {
    vi.stubGlobal(
      "fetch",
      authenticatedFetch(null, {
        loginError: {
          code: "invalid_credentials",
          message: "invalid credentials",
          status: 401,
        },
      }),
    );

    render(
      <MemoryRouter initialEntries={["/login"]}>
        <AppProviders>
          <AppRouter />
        </AppProviders>
      </MemoryRouter>,
    );

    fireEvent.change(await screen.findByLabelText("用户名"), {
      target: { value: "admin" },
    });
    fireEvent.change(screen.getByLabelText("密码"), {
      target: { value: "wrong" },
    });
    expect(document.querySelector('[data-slot="login-feedback"]')).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "登录" }));

    expect(await screen.findByText("用户名或密码不正确，请重试。")).toBeInTheDocument();
    expect(screen.getByLabelText("用户名")).toHaveValue("admin");
    expect(screen.getByLabelText("密码")).toHaveValue("wrong");
  });

  it("clears stale login errors when the user edits either field", async () => {
    vi.stubGlobal(
      "fetch",
      authenticatedFetch(null, {
        loginError: {
          code: "invalid_credentials",
          message: "invalid credentials",
          status: 401,
        },
      }),
    );

    render(
      <MemoryRouter initialEntries={["/login"]}>
        <AppProviders>
          <AppRouter />
        </AppProviders>
      </MemoryRouter>,
    );

    fireEvent.change(await screen.findByLabelText("用户名"), {
      target: { value: "admin" },
    });
    fireEvent.change(screen.getByLabelText("密码"), {
      target: { value: "wrong" },
    });
    fireEvent.click(screen.getByRole("button", { name: "登录" }));

    expect(await screen.findByText("用户名或密码不正确，请重试。")).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText("密码"), {
      target: { value: "wrong-2" },
    });

    await waitFor(() => {
      expect(screen.queryByText("用户名或密码不正确，请重试。")).not.toBeInTheDocument();
    });
  });

  it("shows a rate limit message after repeated login failures", async () => {
    vi.stubGlobal(
      "fetch",
      authenticatedFetch(null, {
        loginError: {
          code: "rate_limited",
          message: "Too many failed login attempts.",
          status: 429,
        },
      }),
    );

    render(
      <MemoryRouter initialEntries={["/login"]}>
        <AppProviders>
          <AppRouter />
        </AppProviders>
      </MemoryRouter>,
    );

    fireEvent.change(await screen.findByLabelText("用户名"), {
      target: { value: "admin" },
    });
    fireEvent.change(screen.getByLabelText("密码"), {
      target: { value: "new-admin-123" },
    });
    fireEvent.click(screen.getByRole("button", { name: "登录" }));

    expect(await screen.findByText("尝试过于频繁，请 5 分钟后再试。")).toBeInTheDocument();
  });

  it("re-localizes login errors after switching language", async () => {
    vi.stubGlobal(
      "fetch",
      authenticatedFetch(null, {
        loginError: {
          code: "provider_timeout",
          message: "上游模型响应超时，请稍后重试。",
          status: 502,
        },
      }),
    );

    render(
      <MemoryRouter initialEntries={["/login"]}>
        <AppProviders>
          <AppRouter />
        </AppProviders>
      </MemoryRouter>,
    );

    fireEvent.change(await screen.findByLabelText("用户名"), { target: { value: "admin" } });
    fireEvent.change(screen.getByLabelText("密码"), { target: { value: "secret" } });
    fireEvent.click(screen.getByRole("button", { name: "登录" }));

    expect(await screen.findByText("服务响应超时，请稍后重试。")).toBeInTheDocument();

    fireEvent.pointerDown(screen.getByRole("button", { name: "语言" }));
    fireEvent.click(await screen.findByText("English"));

    expect(
      await screen.findByText("The service took too long to respond. Try again later."),
    ).toBeInTheDocument();
  });

  it("shows system settings entry and reaches change password for authenticated users", async () => {
    vi.stubGlobal("fetch", authenticatedFetch("admin"));

    render(
      <MemoryRouter initialEntries={["/chat"]}>
        <AppProviders>
          <AppRouter />
        </AppProviders>
      </MemoryRouter>,
    );

    const accountTrigger = await screen.findByRole("button", { name: "打开账户菜单" });
    expect(accountTrigger).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "修改密码" })).not.toBeInTheDocument();

    fireEvent.pointerDown(accountTrigger);
    fireEvent.click(await screen.findByRole("menuitem", { name: "系统设置" }));

    expect(await screen.findByRole("heading", { name: "提供商配置" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("link", { name: "账号安全" }));
    expect(await screen.findByRole("heading", { name: "账号安全" })).toBeInTheDocument();
    expect(await screen.findByRole("button", { name: "修改密码" })).toBeInTheDocument();
  });

  it("returns to login after changing password successfully", async () => {
    const fetchMock = authenticatedFetch("admin");
    vi.stubGlobal("fetch", fetchMock);

    render(
      <MemoryRouter initialEntries={["/settings?section=security"]}>
        <AppProviders>
          <AppRouter />
        </AppProviders>
      </MemoryRouter>,
    );

    fireEvent.click(await screen.findByRole("button", { name: "修改密码" }));
    fireEvent.change(await screen.findByLabelText("当前密码"), {
      target: { value: "admin123456" },
    });
    fireEvent.change(screen.getByLabelText("新密码"), {
      target: { value: "new-admin-123" },
    });
    fireEvent.click(screen.getByRole("button", { name: "提交" }));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        expect.stringMatching(/\/api\/auth\/change-password$/),
        expect.objectContaining({ method: "POST" }),
      );
    });

    expect(await screen.findByRole("heading", { name: "登录" })).toBeInTheDocument();
    expect(useSessionStore.getState().status).toBe("expired");
    expect(sonnerMocks.success).toHaveBeenCalledWith("密码已更新，请重新登录。");
  });

  it("allows theme switching on login page", async () => {
    const fetchMock = authenticatedFetch(null);
    vi.stubGlobal("fetch", fetchMock);

    render(
      <MemoryRouter initialEntries={["/login"]}>
        <AppProviders>
          <AppRouter />
        </AppProviders>
      </MemoryRouter>,
    );

    fireEvent.pointerDown(await screen.findByRole("button", { name: "主题" }));
    fireEvent.click(await screen.findByText("深色"));

    expect(document.documentElement).toHaveClass("dark");
    expect(document.documentElement.dataset.theme).toBeUndefined();
    expect(fetchMock).not.toHaveBeenCalledWith(
      expect.stringContaining("/api/auth/preferences"),
      expect.anything(),
    );
  });

  it("allows language switching on login page", async () => {
    vi.stubGlobal("fetch", authenticatedFetch(null));

    render(
      <MemoryRouter initialEntries={["/login"]}>
        <AppProviders>
          <AppRouter />
        </AppProviders>
      </MemoryRouter>,
    );

    fireEvent.pointerDown(await screen.findByRole("button", { name: "语言" }));
    fireEvent.click(await screen.findByText("English"));

    expect(await screen.findByRole("heading", { name: "Login" })).toBeInTheDocument();
    expect(window.localStorage.getItem("knowledge-chatbox-language")).toBe("en");
  });

  it("persists authenticated theme switching from settings route through preferences api", async () => {
    const fetchMock = authenticatedFetch("admin");
    vi.stubGlobal("fetch", fetchMock);

    render(
      <MemoryRouter initialEntries={["/settings"]}>
        <AppProviders>
          <AppRouter />
        </AppProviders>
      </MemoryRouter>,
    );

    fireEvent.click(await screen.findByRole("link", { name: "偏好与外观" }));
    expect(await screen.findByRole("heading", { name: "偏好与外观" })).toBeInTheDocument();
    fireEvent.pointerDown(await screen.findByLabelText("主题"));
    fireEvent.click(await screen.findByText("深色"));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        expect.stringMatching(/\/api\/auth\/preferences$/),
        expect.objectContaining({
          method: "PATCH",
          body: JSON.stringify({ theme_preference: "dark" }),
        }),
      );
    });
    const settingsSaveCalls = fetchMock.mock.calls.filter(
      ([url, init]) => String(url).endsWith("/api/settings") && init?.method === "PUT",
    );
    expect(settingsSaveCalls).toHaveLength(0);
    expect(document.documentElement).toHaveClass("dark");
    expect(document.documentElement.dataset.theme).toBeUndefined();
    expect(window.localStorage.getItem("knowledge-chatbox-theme")).toBe("dark");
  });
});
