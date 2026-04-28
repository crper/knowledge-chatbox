import { getAccessToken, setAccessToken } from "@/lib/auth/token-store";
import { http, HttpResponse } from "msw";
import { apiResponse, apiError, overrideHandler } from "@/test/msw";
import {
  bootstrapAuthSession,
  changePassword,
  getCurrentUser,
  login,
  logout,
  refreshSession,
  updatePreferences,
} from "./auth";

describe("auth api", () => {
  beforeEach(() => {
    setAccessToken(null);
  });

  it("calls login endpoint without mutating the access token store", async () => {
    overrideHandler(
      http.post("*/api/auth/login", () => {
        return apiResponse({
          access_token: "access-token",
          expires_in: 900,
          token_type: "Bearer",
          user: { username: "admin" },
        });
      }),
    );

    const result = await login({ username: "admin", password: "secret" });

    expect(result.access_token).toBe("access-token");
    expect(getAccessToken()).toBeNull();
  });

  it("calls refresh endpoint and stores the next access token", async () => {
    overrideHandler(
      http.post("*/api/auth/refresh", () => {
        return apiResponse({
          access_token: "refreshed-token",
          expires_in: 900,
          token_type: "Bearer",
        });
      }),
    );

    await expect(refreshSession()).resolves.toBe("refreshed-token");
    expect(getAccessToken()).toBe("refreshed-token");
  });

  it("calls bootstrap endpoint without mutating the access token store", async () => {
    overrideHandler(
      http.post("*/api/auth/bootstrap", () => {
        return apiResponse({
          authenticated: true,
          access_token: "bootstrapped-token",
          expires_in: 900,
          token_type: "Bearer",
          user: { username: "admin" },
        });
      }),
    );

    await expect(bootstrapAuthSession()).resolves.toMatchObject({
      access_token: "bootstrapped-token",
      user: { username: "admin" },
    });

    expect(getAccessToken()).toBeNull();
  });

  it("returns null when bootstrap endpoint reports an anonymous session without clearing an existing token", async () => {
    setAccessToken("existing-token");
    overrideHandler(
      http.post("*/api/auth/bootstrap", () => {
        return apiResponse({
          authenticated: false,
          access_token: null,
          expires_in: null,
          token_type: "Bearer",
          user: null,
        });
      }),
    );

    await expect(bootstrapAuthSession()).resolves.toBeNull();
    expect(getAccessToken()).toBe("existing-token");
  });

  it("calls logout endpoint without mutating the access token store", async () => {
    setAccessToken("existing-token");
    overrideHandler(
      http.post("*/api/auth/logout", () => {
        return apiResponse({ status: "ok" });
      }),
    );

    await logout();
    expect(getAccessToken()).toBe("existing-token");
  });

  it("calls auth me endpoint", async () => {
    setAccessToken("access-token");

    overrideHandler(
      http.get("*/api/auth/me", ({ request }) => {
        const authHeader = request.headers.get("Authorization");
        expect(authHeader).toBe("Bearer access-token");

        return apiResponse({ username: "admin" });
      }),
    );

    await getCurrentUser();
  });

  it("returns null for unauthorized current user responses", async () => {
    overrideHandler(
      http.get("*/api/auth/me", () => {
        return apiError(
          { code: "unauthorized", message: "登录状态已失效，请重新登录。" },
          { status: 401, statusText: "Unauthorized" },
        );
      }),
    );

    overrideHandler(
      http.post("*/api/auth/refresh", () => {
        return apiError(
          { code: "unauthorized", message: "Authentication required." },
          { status: 401, statusText: "Unauthorized" },
        );
      }),
    );

    await expect(getCurrentUser()).resolves.toBeNull();
  });

  it("preserves service errors from current user endpoint", async () => {
    overrideHandler(
      http.get("*/api/auth/me", () => {
        return new HttpResponse(null, { status: 500, statusText: "Server Error" });
      }),
    );

    await expect(getCurrentUser()).rejects.toMatchObject({
      message: "服务暂时不可用，请稍后重试。",
      status: 500,
    });
  });

  // TODO: 需要修复 fake timers 与 MSW abort 信号的交互问题
  it.skip("times out the current user probe so the login page is not blocked indefinitely", async () => {
    vi.useFakeTimers();

    const { delay, http, HttpResponse } = await import("msw");

    overrideHandler(
      http.get("*/api/auth/me", async () => {
        await delay("infinite");
        return HttpResponse.json({});
      }),
    );

    const currentUserPromise = getCurrentUser();

    await vi.advanceTimersByTimeAsync(3500);

    await expect(currentUserPromise).rejects.toMatchObject({
      message: "服务响应超时，请稍后重试。",
      status: 504,
    });

    vi.useRealTimers();
  });

  it("calls change password endpoint", async () => {
    overrideHandler(
      http.post("*/api/auth/change-password", () => {
        return apiResponse({ username: "admin" });
      }),
    );

    await changePassword({ currentPassword: "old", newPassword: "new" });
  });

  it("calls update preferences endpoint", async () => {
    overrideHandler(
      http.patch("*/api/auth/preferences", () => {
        return apiResponse({ theme_preference: "dark" });
      }),
    );

    await updatePreferences({ themePreference: "dark" });
  });
});
