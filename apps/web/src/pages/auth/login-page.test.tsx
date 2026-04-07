import { fireEvent, screen, waitFor, within } from "@testing-library/react";

import { i18n } from "@/i18n";
import { THEME_SYNC_ON_LOGIN_STORAGE_KEY } from "@/lib/config/constants";
import { useSessionStore } from "@/lib/auth/session-store";
import { setAccessToken } from "@/lib/auth/token-store";
import { buildAppUser } from "@/test/fixtures/app";
import { http } from "msw";
import { createTestServer, overrideHandler, apiResponse, apiError } from "@/test/msw";
import { renderRoute } from "@/test/render-route";

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

describe("login page", () => {
  beforeEach(async () => {
    localStorage.clear();
    setAccessToken(null);
    useSessionStore.getState().reset();
    sonnerMocks.error.mockReset();
    sonnerMocks.success.mockReset();
    await i18n.changeLanguage("zh-CN");
    createTestServer({ user: null, authenticated: false });
    overrideHandler(
      http.get("*/api/chat/profile", () =>
        apiResponse({
          attachments_enabled: true,
          default_model: null,
          profile_ready: true,
          reasoning_enabled: true,
        }),
      ),
    );
  });

  it("validates required login fields before submitting", async () => {
    renderRoute("/login");

    fireEvent.click(await screen.findByRole("button", { name: "登录" }));

    expect(await screen.findByText("请输入用户名和密码。")).toBeInTheDocument();
  });

  it("keeps login validation visible until the corrected fields blur", async () => {
    renderRoute("/login");

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
  });

  it("shows login page for unauthenticated users", async () => {
    renderRoute("/chat");

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
    renderRoute("/login");

    const introRegion = await screen.findByLabelText("工作台入口说明");
    const loginRegion = screen.getByLabelText("登录入口");

    expect(within(introRegion).getByText("登录后工作路径")).toBeInTheDocument();
    expect(within(loginRegion).getByRole("heading", { name: "登录" })).toBeInTheDocument();
    expect(within(loginRegion).getByRole("button", { name: "登录" })).toBeInTheDocument();
  });

  it("keeps vertical scrolling available on mobile login layouts", async () => {
    renderRoute("/login");

    const loginHeading = await screen.findByRole("heading", { name: "登录" });
    const loginPageMain = loginHeading.closest("main");

    expect(loginPageMain).not.toBeNull();
    expect(loginPageMain).toHaveClass("overflow-x-hidden");
    expect(loginPageMain).not.toHaveClass("overflow-hidden");
  });

  it("opens workspace about dialog from the help entry", async () => {
    renderRoute("/login");

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
    overrideHandler(
      http.post("*/api/auth/login", () => {
        return apiResponse({
          authenticated: true,
          access_token: "login-token",
          expires_in: 900,
          token_type: "Bearer",
          user: buildAppUser("admin"),
        });
      }),
    );

    renderRoute("/login");

    fireEvent.change(await screen.findByLabelText("用户名"), {
      target: { value: "admin" },
    });
    fireEvent.change(screen.getByLabelText("密码"), {
      target: { value: "password" },
    });
    fireEvent.click(screen.getByRole("button", { name: "登录" }));

    expect(await screen.findByRole("button", { name: "新建会话" })).toBeInTheDocument();
  });

  it("keeps the login-page theme after sign-in and syncs it to account preferences", async () => {
    overrideHandler(
      http.post("*/api/auth/login", () => {
        return apiResponse({
          authenticated: true,
          access_token: "login-token",
          expires_in: 900,
          token_type: "Bearer",
          user: buildAppUser("admin"),
        });
      }),
    );
    overrideHandler(
      http.patch("*/api/auth/preferences", async ({ request }) => {
        const body = (await request.json()) as { theme_preference?: string };
        return apiResponse(
          buildAppUser("admin", {
            theme_preference: body?.theme_preference as "dark" | "light" | "system",
          }),
        );
      }),
    );

    renderRoute("/login");

    window.sessionStorage.setItem(THEME_SYNC_ON_LOGIN_STORAGE_KEY, "dark");
    fireEvent.change(await screen.findByLabelText("用户名"), {
      target: { value: "admin" },
    });
    fireEvent.change(screen.getByLabelText("密码"), {
      target: { value: "secret" },
    });
    fireEvent.click(screen.getByRole("button", { name: "登录" }));

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "新建会话" })).toBeInTheDocument();
    });
    expect(document.documentElement).toHaveClass("dark");
    expect(window.localStorage.getItem("knowledge-chatbox-theme")).toBe("dark");
  });

  it("does not block sign-in navigation while theme preference sync is pending", async () => {
    overrideHandler(
      http.post("*/api/auth/login", () => {
        return apiResponse({
          authenticated: true,
          access_token: "login-token",
          expires_in: 900,
          token_type: "Bearer",
          user: buildAppUser("admin"),
        });
      }),
    );
    overrideHandler(
      http.patch("*/api/auth/preferences", () => {
        return apiResponse(buildAppUser("admin", { theme_preference: "dark" }));
      }),
    );

    renderRoute("/login");

    fireEvent.click(await screen.findByRole("button", { name: "主题" }));
    fireEvent.click(await screen.findByRole("menuitemradio", { name: "深色" }));
    fireEvent.change(screen.getByLabelText("用户名"), {
      target: { value: "admin" },
    });
    fireEvent.change(screen.getByLabelText("密码"), {
      target: { value: "secret" },
    });
    fireEvent.click(screen.getByRole("button", { name: "登录" }));

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "新建会话" })).toBeInTheDocument();
    });
  });

  it("prevents duplicate login submissions while pending", async () => {
    let resolveLogin: ((value: Response) => void) | undefined;

    overrideHandler(
      http.post("*/api/auth/login", () => {
        return new Promise((resolve) => {
          resolveLogin = resolve;
        });
      }),
    );

    renderRoute("/login");

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

    if (resolveLogin) {
      resolveLogin(
        apiResponse({
          authenticated: true,
          access_token: "login-token",
          expires_in: 900,
          token_type: "Bearer",
          user: buildAppUser("admin"),
        }),
      );
    }
  });

  it("shows an actionable error message after login failure", async () => {
    overrideHandler(
      http.post("*/api/auth/login", () => {
        return apiError(
          { code: "invalid_credentials", message: "invalid credentials" },
          { status: 401 },
        );
      }),
    );

    renderRoute("/login");

    fireEvent.change(await screen.findByLabelText("用户名"), {
      target: { value: "admin" },
    });
    fireEvent.change(screen.getByLabelText("密码"), {
      target: { value: "wrong" },
    });
    fireEvent.click(screen.getByRole("button", { name: "登录" }));

    expect(await screen.findByText("用户名或密码不正确，请重试。")).toBeInTheDocument();
  });

  it("clears stale login errors when the user edits either field", async () => {
    overrideHandler(
      http.post("*/api/auth/login", () => {
        return apiError(
          { code: "invalid_credentials", message: "invalid credentials" },
          { status: 401 },
        );
      }),
    );

    renderRoute("/login");

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
    overrideHandler(
      http.post("*/api/auth/login", () => {
        return apiError(
          { code: "rate_limited", message: "Too many failed login attempts." },
          { status: 429 },
        );
      }),
    );

    renderRoute("/login");

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
    overrideHandler(
      http.post("*/api/auth/login", () => {
        return apiError(
          { code: "provider_timeout", message: "上游模型响应超时，请稍后重试。" },
          { status: 502 },
        );
      }),
    );

    renderRoute("/login");

    fireEvent.change(await screen.findByLabelText("用户名"), { target: { value: "admin" } });
    fireEvent.change(screen.getByLabelText("密码"), { target: { value: "secret" } });
    fireEvent.click(screen.getByRole("button", { name: "登录" }));

    expect(await screen.findByText("服务响应超时，请稍后重试。")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "语言" }));
    fireEvent.click(await screen.findByRole("menuitemradio", { name: "English" }));

    expect(
      await screen.findByText("The service took too long to respond. Try again later."),
    ).toBeInTheDocument();
  });

  it("shows system settings entry and reaches change password for authenticated users", async () => {
    createTestServer({ user: buildAppUser("admin"), authenticated: true });
    const profileHandler = http.get("*/api/chat/profile", () =>
      apiResponse({ configured: true, provider: "openai", model: "gpt-5.4" }),
    );
    overrideHandler(profileHandler);

    renderRoute("/chat");

    const accountTrigger = await screen.findByRole("button", { name: "打开账户菜单" });
    expect(accountTrigger).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "修改密码" })).not.toBeInTheDocument();

    fireEvent.click(accountTrigger);
    fireEvent.click(await screen.findByRole("menuitem", { name: "系统设置" }));

    expect(await screen.findByRole("heading", { name: "提供商配置" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("link", { name: "账号安全" }));
    expect(await screen.findByRole("heading", { name: "账号安全" })).toBeInTheDocument();
    expect(await screen.findByRole("button", { name: "修改密码" })).toBeInTheDocument();
  });

  it("returns to login after changing password successfully", async () => {
    createTestServer({ user: buildAppUser("admin"), authenticated: true });
    const profileHandler = http.get("*/api/chat/profile", () =>
      apiResponse({ configured: true, provider: "openai", model: "gpt-5.4" }),
    );
    overrideHandler(profileHandler);
    overrideHandler(
      http.post("*/api/auth/change-password", () => {
        return apiResponse(buildAppUser("admin"));
      }),
    );

    renderRoute("/settings/security");

    fireEvent.click(await screen.findByRole("button", { name: "修改密码" }));
    fireEvent.change(await screen.findByLabelText("当前密码"), {
      target: { value: "admin123456" },
    });
    fireEvent.change(screen.getByLabelText("新密码"), {
      target: { value: "new-admin-123" },
    });
    fireEvent.click(screen.getByRole("button", { name: "提交" }));

    expect(await screen.findByRole("heading", { name: "登录" })).toBeInTheDocument();
    expect(useSessionStore.getState().status).toBe("expired");
    expect(sonnerMocks.success).toHaveBeenCalledWith("密码已更新，请重新登录。");
  });

  it("allows theme switching on login page", async () => {
    renderRoute("/login");

    fireEvent.click(await screen.findByRole("button", { name: "主题" }));
    fireEvent.click(await screen.findByRole("menuitemradio", { name: "深色" }));

    expect(document.documentElement).toHaveClass("dark");
    expect(document.documentElement.dataset.theme).toBeUndefined();
  });

  it("allows language switching on login page", async () => {
    renderRoute("/login");

    fireEvent.click(await screen.findByRole("button", { name: "语言" }));
    fireEvent.click(await screen.findByRole("menuitemradio", { name: "English" }));

    expect(await screen.findByRole("heading", { name: "Login" })).toBeInTheDocument();
    expect(window.localStorage.getItem("knowledge-chatbox-language")).toBe("en");
  });

  it("persists authenticated theme switching from settings route through preferences api", async () => {
    createTestServer({ user: buildAppUser("admin"), authenticated: true });
    const profileHandler = http.get("*/api/chat/profile", () =>
      apiResponse({ configured: true, provider: "openai", model: "gpt-5.4" }),
    );
    overrideHandler(profileHandler);
    overrideHandler(
      http.patch("*/api/auth/preferences", async ({ request }) => {
        const body = (await request.json()) as { theme_preference?: string };
        return apiResponse(
          buildAppUser("admin", {
            theme_preference: body?.theme_preference as "dark" | "light" | "system",
          }),
        );
      }),
    );

    renderRoute("/settings");

    fireEvent.click(await screen.findByRole("link", { name: "偏好与外观" }));
    expect(await screen.findByRole("heading", { name: "偏好与外观" })).toBeInTheDocument();
    fireEvent.click(await screen.findByLabelText("主题"));
    fireEvent.click(await screen.findByRole("menuitemradio", { name: "深色" }));

    await waitFor(() => {
      expect(document.documentElement).toHaveClass("dark");
      expect(window.localStorage.getItem("knowledge-chatbox-theme")).toBe("dark");
    });
  });
});
