import { QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";

import { i18n } from "@/i18n";
import type { AppUser } from "@/lib/api/client";
import { queryKeys } from "@/lib/api/query-keys";
import { I18nProvider } from "@/providers/i18n-provider";
import { ThemeProvider } from "@/providers/theme-provider";
import { createTestQueryClient } from "@/test/query-client";
import { TestRouter } from "@/test/test-router";
import { WorkspaceRail } from "./workspace-rail";

function buildUser(): AppUser {
  return {
    id: 1,
    username: "admin",
    role: "admin",
    status: "active",
    theme_preference: "system",
  };
}

function renderWorkspaceRail(pathname = "/knowledge") {
  const queryClient = createTestQueryClient();
  const onLogout = vi.fn().mockResolvedValue(undefined);

  queryClient.setQueryData(queryKeys.auth.me, buildUser());

  render(
    <TestRouter initialEntry={pathname}>
      <I18nProvider>
        <ThemeProvider>
          <QueryClientProvider client={queryClient}>
            <WorkspaceRail onLogout={onLogout} pathname={pathname} user={buildUser()} />
          </QueryClientProvider>
        </ThemeProvider>
      </I18nProvider>
    </TestRouter>,
  );

  return { onLogout };
}

describe("WorkspaceRail", () => {
  beforeEach(async () => {
    localStorage.clear();
    await i18n.changeLanguage("zh-CN");
  });

  it("renders top-level workbench links including graph", async () => {
    renderWorkspaceRail("/graph");

    expect(await screen.findByRole("link", { name: "对话" })).toHaveAttribute("href", "/chat");
    expect(screen.getByRole("link", { name: "资源" })).toHaveAttribute("href", "/knowledge");
    expect(screen.getByRole("link", { name: "图谱" })).toHaveAttribute("href", "/graph");
  });

  it("keeps the compact account menu available", async () => {
    const { onLogout } = renderWorkspaceRail("/knowledge");

    fireEvent.click(await screen.findByRole("button", { name: "打开账户菜单" }));
    fireEvent.click(await screen.findByRole("menuitem", { name: "退出登录" }));

    await waitFor(() => expect(onLogout).toHaveBeenCalledTimes(1));
  });
});
