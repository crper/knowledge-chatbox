import { getAccessToken, setAccessToken } from "@/lib/auth/token-store";
import { jsonResponse } from "@/test/http";
import {
  changePassword,
  getCurrentUser,
  login,
  logout,
  refreshSession,
  updatePreferences,
} from "./auth";

function apiPath(path: string) {
  return expect.stringMatching(new RegExp(`${path.replaceAll("/", "\\/")}$`));
}

describe("auth api", () => {
  beforeEach(() => {
    setAccessToken(null);
  });

  it("calls login endpoint", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse({
        success: true,
        data: {
          access_token: "access-token",
          expires_in: 900,
          token_type: "Bearer",
          user: { username: "admin" },
        },
        error: null,
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const result = await login({ username: "admin", password: "secret" });

    expect(fetchMock).toHaveBeenCalledWith(
      apiPath("/api/auth/login"),
      expect.objectContaining({
        method: "POST",
      }),
    );
    expect(result.accessToken).toBe("access-token");
  });

  it("calls refresh endpoint and stores the next access token", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
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
    vi.stubGlobal("fetch", fetchMock);

    await expect(refreshSession()).resolves.toBe("refreshed-token");

    expect(fetchMock).toHaveBeenCalledWith(
      apiPath("/api/auth/refresh"),
      expect.objectContaining({ method: "POST" }),
    );
    expect(getAccessToken()).toBe("refreshed-token");
  });

  it("calls logout endpoint", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(jsonResponse({ success: true, data: { status: "ok" }, error: null }));
    vi.stubGlobal("fetch", fetchMock);

    await logout();

    expect(fetchMock).toHaveBeenCalledWith(
      apiPath("/api/auth/logout"),
      expect.objectContaining({ method: "POST" }),
    );
  });

  it("calls auth me endpoint", async () => {
    setAccessToken("access-token");
    const fetchMock = vi
      .fn()
      .mockResolvedValue(jsonResponse({ success: true, data: { username: "admin" }, error: null }));
    vi.stubGlobal("fetch", fetchMock);

    await getCurrentUser();

    expect(fetchMock).toHaveBeenCalledWith(
      apiPath("/api/auth/me"),
      expect.objectContaining({
        credentials: "include",
        method: "GET",
      }),
    );

    const [, requestInit] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(new Headers(requestInit.headers).get("Authorization")).toBe("Bearer access-token");
  });

  it("returns null for unauthorized current user responses", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockImplementation((input: string) => {
        if (input.endsWith("/api/auth/refresh")) {
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
          jsonResponse(
            {
              success: false,
              data: null,
              error: { code: "unauthorized", message: "登录状态已失效，请重新登录。" },
            },
            { status: 401, statusText: "Unauthorized" },
          ),
        );
      }),
    );

    await expect(getCurrentUser()).resolves.toBeNull();
  });

  it("preserves service errors from current user endpoint", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response("", { status: 500, statusText: "Server Error" })),
    );

    await expect(getCurrentUser()).rejects.toMatchObject({
      message: "服务暂时不可用，请稍后重试。",
      status: 500,
    });
  });

  it("times out the current user probe so the login page is not blocked indefinitely", async () => {
    vi.useFakeTimers();
    vi.stubGlobal(
      "fetch",
      vi.fn().mockImplementation((_: string, init?: RequestInit) => {
        return new Promise((_, reject) => {
          init?.signal?.addEventListener("abort", () => {
            const abortError = new Error("The operation was aborted.");
            abortError.name = "AbortError";
            reject(abortError);
          });
        });
      }),
    );

    const currentUserPromise = getCurrentUser();
    const rejectionAssertion = expect(currentUserPromise).rejects.toMatchObject({
      message: "服务响应超时，请稍后重试。",
      status: 504,
    });
    await vi.advanceTimersByTimeAsync(3000);
    await rejectionAssertion;

    vi.useRealTimers();
  });

  it("calls change password endpoint", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(jsonResponse({ success: true, data: { username: "admin" }, error: null }));
    vi.stubGlobal("fetch", fetchMock);

    await changePassword({ currentPassword: "old", newPassword: "new" });

    expect(fetchMock).toHaveBeenCalledWith(
      apiPath("/api/auth/change-password"),
      expect.objectContaining({ method: "POST" }),
    );
  });

  it("calls update preferences endpoint", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(
        jsonResponse({ success: true, data: { theme_preference: "dark" }, error: null }),
      );
    vi.stubGlobal("fetch", fetchMock);

    await updatePreferences({ themePreference: "dark" });

    expect(fetchMock).toHaveBeenCalledWith(
      apiPath("/api/auth/preferences"),
      expect.objectContaining({ method: "PATCH" }),
    );
  });
});
