import { screen } from "@testing-library/react";

import { i18n } from "@/i18n";
import { useSessionStore } from "@/lib/auth/session-store";
import { setAccessToken } from "@/lib/auth/token-store";
import { buildAppSettings, buildAppUser } from "@/test/fixtures/app";
import { createTestServer } from "@/test/msw";
import { renderRoute } from "@/test/render-route";
import { mockDesktopViewport } from "@/test/viewport";

describe("AppShell smoke", () => {
  beforeEach(async () => {
    localStorage.clear();
    sessionStorage.clear();
    setAccessToken(null);
    useSessionStore.getState().reset();
    mockDesktopViewport();
    await i18n.changeLanguage("zh-CN");
  });

  it("renders the login route under the TanStack router runtime", async () => {
    createTestServer({ user: null, authenticated: false });

    renderRoute("/login");

    expect(await screen.findByRole("heading", { name: "登录" })).toBeInTheDocument();
  });

  it("renders canonical settings routes under the TanStack router runtime", async () => {
    createTestServer({
      user: buildAppUser("admin"),
      authenticated: true,
      settings: buildAppSettings(),
    });

    renderRoute("/settings/security");

    expect(await screen.findByRole("heading", { name: "账号安全" })).toBeInTheDocument();
  });
});
