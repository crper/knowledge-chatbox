import { QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

import { i18n } from "@/i18n";
import type { AppUser } from "@/lib/api/client";
import { LANGUAGE_STORAGE_KEY, THEME_STORAGE_KEY } from "@/lib/config/constants";
import { queryKeys } from "@/lib/api/query-keys";
import { I18nProvider } from "@/providers/i18n-provider";
import { ThemeProvider } from "@/providers/theme-provider";
import { http } from "msw";
import { apiResponse, overrideHandler } from "@/test/msw";
import { createTestQueryClient } from "@/test/query-client";
import { StandardSidebar } from "./standard-sidebar";

function buildUser(role: "admin" | "user"): AppUser {
  return {
    id: 1,
    username: role,
    role,
    status: "active",
    theme_preference: "system",
  };
}

function renderStandardSidebar(pathname = "/chat", user: AppUser = buildUser("admin")) {
  const queryClient = createTestQueryClient({
    defaultOptions: {
      mutations: { retry: false },
      queries: { retry: false },
    },
  });
  const onLogout = vi.fn().mockResolvedValue(undefined);

  queryClient.setQueryData(queryKeys.auth.me, user);

  const result = render(
    <MemoryRouter initialEntries={[pathname]}>
      <I18nProvider>
        <ThemeProvider>
          <QueryClientProvider client={queryClient}>
            <StandardSidebar onLogout={onLogout} pathname={pathname} user={user} />
          </QueryClientProvider>
        </ThemeProvider>
      </I18nProvider>
    </MemoryRouter>,
  );

  return {
    ...result,
    onLogout,
    queryClient,
  };
}

describe("StandardSidebar", () => {
  beforeEach(async () => {
    localStorage.clear();
    await i18n.changeLanguage("zh-CN");
  });

  it("renders workspace links, settings links, and account menu on settings routes", async () => {
    renderStandardSidebar("/settings?section=security");

    expect(screen.getByRole("link", { name: "对话" })).toHaveAttribute("href", "/chat");
    expect(screen.getByRole("link", { name: "资源" })).toHaveAttribute("href", "/knowledge");
    expect(screen.getByRole("link", { name: "提供商配置" })).toHaveAttribute(
      "href",
      "/settings?section=providers",
    );
    expect(screen.getByRole("link", { name: "系统提示词" })).toHaveAttribute(
      "href",
      "/settings?section=prompt",
    );
    expect(screen.getByRole("link", { name: "账号安全" })).toHaveAttribute(
      "href",
      "/settings?section=security",
    );
    expect(screen.getByText("admin")).toBeInTheDocument();
    expect(screen.getByText("角色：admin")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "打开账户菜单" }));

    expect(await screen.findByText("外观")).toBeInTheDocument();
    expect(screen.getByRole("menuitemradio", { name: "浅色" })).toBeInTheDocument();
    expect(screen.getByRole("menuitemradio", { name: "深色" })).toBeInTheDocument();
    expect(screen.getByRole("menuitemradio", { name: "跟随系统" })).toBeInTheDocument();
    expect(screen.getByRole("menuitemradio", { name: "简体中文" })).toBeInTheDocument();
    expect(screen.getByRole("menuitemradio", { name: "English" })).toBeInTheDocument();
    expect(screen.getByRole("menuitem", { name: "系统设置" })).toHaveAttribute("href", "/settings");
    expect(screen.getByRole("menuitem", { name: "退出登录" })).toBeInTheDocument();
  });

  it("hides settings section links outside settings routes", () => {
    renderStandardSidebar("/chat", buildUser("user"));

    expect(screen.getByRole("link", { name: "对话" })).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "提供商配置" })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "用户管理" })).not.toBeInTheDocument();
  });

  it("persists theme changes from the account menu and syncs the current user cache", async () => {
    overrideHandler(
      http.patch("*/api/auth/preferences", async ({ request }) => {
        const body = (await request.json()) as { theme_preference?: string };
        return apiResponse({
          ...buildUser("admin"),
          theme_preference: body?.theme_preference ?? "system",
        });
      }),
    );

    const { queryClient } = renderStandardSidebar("/chat", buildUser("admin"));

    fireEvent.click(screen.getByRole("button", { name: "打开账户菜单" }));
    fireEvent.click(await screen.findByRole("menuitemradio", { name: "深色" }));

    await waitFor(() => expect(document.documentElement.classList.contains("dark")).toBe(true));
    expect(localStorage.getItem(THEME_STORAGE_KEY)).toBe("dark");
    expect(queryClient.getQueryData(queryKeys.auth.me)).toMatchObject({
      theme_preference: "dark",
    });
  });

  it("switches language locally without calling the preferences api", async () => {
    renderStandardSidebar("/chat", buildUser("admin"));

    fireEvent.click(screen.getByRole("button", { name: "打开账户菜单" }));
    fireEvent.click(await screen.findByRole("menuitemradio", { name: "English" }));

    await waitFor(() => expect(i18n.language).toBe("en"));
    expect(localStorage.getItem(LANGUAGE_STORAGE_KEY)).toBe("en");
  });

  it("triggers logout from the account menu", async () => {
    const { onLogout } = renderStandardSidebar("/chat", buildUser("admin"));

    fireEvent.click(screen.getByRole("button", { name: "打开账户菜单" }));
    fireEvent.click(await screen.findByRole("menuitem", { name: "退出登录" }));

    await waitFor(() => expect(onLogout).toHaveBeenCalledTimes(1));
  });
});
