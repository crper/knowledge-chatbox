import { fireEvent, screen, waitFor } from "@testing-library/react";
import { i18n } from "@/i18n";

import type { AppUser } from "@/lib/api/client";
import { useSessionStore } from "@/lib/auth/session-store";
import { setAccessToken } from "@/lib/auth/token-store";
import { THEME_SYNC_ON_LOGIN_STORAGE_KEY } from "@/lib/config/constants";
import { cloneJson } from "@/test/chat";
import { buildAppUser } from "@/test/fixtures/app";
import { createTestServer, overrideHandler, apiResponse } from "@/test/msw";
import { renderRoute } from "@/test/render-route";
import { http, HttpResponse } from "msw";
import { mockDesktopViewport } from "@/test/viewport";

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

    renderRoute("/login");

    expect(await screen.findByRole("heading", { name: "登录" })).toBeInTheDocument();
    expect(screen.queryByText("服务暂时不可用，请稍后重试。")).not.toBeInTheDocument();
  });

  it("renders admin navigation for authenticated admin users", async () => {
    setupAuthResponse({
      id: 1,
      username: "admin",
      role: "admin",
      status: "active",
      theme_preference: "system",
    });

    renderRoute("/chat");

    expect(await screen.findByRole("link", { name: "资源" })).toBeInTheDocument();
    expect(screen.getByRole("img", { name: "Knowledge Chatbox 标志" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "对话" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "打开账户菜单" })).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "用户" })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "打开账户菜单" }));

    expect(await screen.findByRole("menuitem", { name: "系统设置" })).toHaveAttribute(
      "href",
      "/settings/providers",
    );
    expect(screen.getByRole("menuitem", { name: "退出登录" })).toBeInTheDocument();
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

    renderRoute("/knowledge");

    const layout = await screen.findByTestId("standard-desktop-layout");
    const sidebar = await screen.findByRole("complementary", { name: "工作台侧栏" });
    const knowledgeLink = screen.getByRole("link", { name: "资源" });

    expect(layout).toBeInTheDocument();
    expect(sidebar).toBeInTheDocument();
    expect(knowledgeLink).toHaveAttribute("href", "/knowledge");
    expect(screen.getByRole("main")).toBeInTheDocument();
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

    renderRoute("/chat");

    expect(await screen.findByRole("link", { name: "Resources" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Chat" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Open account menu" })).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Users" })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Open account menu" }));

    expect(await screen.findByRole("menuitem", { name: "System settings" })).toHaveAttribute(
      "href",
      "/settings/providers",
    );
    expect(screen.getByRole("menuitem", { name: "Log Out" })).toBeInTheDocument();
  });

  it("applies stored theme preference", async () => {
    localStorage.setItem("knowledge-chatbox-theme", "dark");
    setupAuthResponse(null, false, 401);

    renderRoute("/login");

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

    renderRoute("/chat");

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

    renderRoute("/chat");

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
