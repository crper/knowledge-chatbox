import { screen } from "@testing-library/react";

import { i18n } from "@/i18n";
import { useSessionStore } from "@/lib/auth/session-store";
import { setAccessToken } from "@/lib/auth/token-store";
import { buildAppSettings, buildAppUser } from "@/test/fixtures/app";
import { createTestServer } from "@/test/msw";
import { mockDesktopViewport } from "@/test/viewport";
import { renderRoute } from "./render-route";

describe("renderRoute", () => {
  beforeEach(async () => {
    localStorage.clear();
    sessionStorage.clear();
    setAccessToken(null);
    useSessionStore.getState().reset();
    mockDesktopViewport();
    await i18n.changeLanguage("zh-CN");
  });

  it("renders the login route with the TanStack memory router", async () => {
    createTestServer({ user: null, authenticated: false });

    renderRoute("/login");

    expect(await screen.findByRole("heading", { name: "登录" })).toBeInTheDocument();
  });

  it("renders canonical settings routes with the TanStack memory router", async () => {
    createTestServer({
      user: buildAppUser("admin"),
      authenticated: true,
      settings: buildAppSettings(),
    });

    renderRoute("/settings/providers");

    expect(await screen.findByRole("heading", { name: "提供商配置" })).toBeInTheDocument();
  });
});
