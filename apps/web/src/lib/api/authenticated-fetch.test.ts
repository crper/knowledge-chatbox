import { refreshSession } from "@/features/auth/api/auth";
import { getAccessToken, setAccessToken } from "@/lib/auth/token-store";
import { useSessionStore } from "@/lib/auth/session-store";
import { env } from "@/lib/config/env";
import { http, HttpResponse } from "msw";
import { apiResponse, apiError, overrideHandler } from "@/test/msw";
import { authenticatedFetch } from "./authenticated-fetch";

describe("authenticatedFetch", () => {
  const originalStatus = useSessionStore.getState().status;
  const originalApiBaseUrl = env.apiBaseUrl;

  beforeEach(() => {
    useSessionStore.getState().setStatus("bootstrapping");
  });

  afterEach(() => {
    useSessionStore.getState().setStatus(originalStatus);
    setAccessToken(null);
    env.apiBaseUrl = originalApiBaseUrl;
  });

  it("does not hit protected chat endpoints after the session is already marked expired", async () => {
    overrideHandler(
      http.get("*/api/chat/sessions", () => {
        return apiResponse([{ id: 1, title: "Session A" }]);
      }),
    );

    useSessionStore.getState().setStatus("expired");

    const response = await authenticatedFetch("http://localhost:8000/api/chat/sessions");

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toMatchObject({
      success: false,
      data: null,
      error: {
        code: "unauthorized",
      },
    });
  });

  it("still short-circuits protected requests when auth-like paths only appear in the query string", async () => {
    overrideHandler(
      http.get("*/api/chat/sessions", () => {
        return apiResponse([{ id: 1, title: "Session A" }]);
      }),
    );

    useSessionStore.getState().setStatus("expired");

    const response = await authenticatedFetch(
      "http://localhost:8000/api/chat/sessions?next=/api/auth/login",
    );

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toMatchObject({
      success: false,
      data: null,
      error: {
        code: "unauthorized",
      },
    });
  });

  it("does not short-circuit absolute login urls when dev api base url is empty", async () => {
    env.apiBaseUrl = "";

    overrideHandler(
      http.post("*/api/auth/login", async ({ request }) => {
        const payload = (await request.json()) as {
          password?: string;
          username?: string;
        };
        return apiResponse({
          access_token: "login-token",
          expires_in: 900,
          token_type: "Bearer",
          user: {
            id: 1,
            username: payload.username ?? "admin",
            role: "admin",
            status: "active",
            theme_preference: "system",
          },
        });
      }),
    );

    useSessionStore.getState().setStatus("expired");

    const response = await authenticatedFetch("http://localhost:8000/api/auth/login", {
      body: JSON.stringify({
        username: "admin",
        password: "Admin123456",
      }),
      headers: {
        "Content-Type": "application/json",
      },
      method: "POST",
    });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      success: true,
      data: {
        access_token: "login-token",
        user: {
          username: "admin",
        },
      },
    });
  });

  it("reuses the same refresh request when a direct refresh overlaps a protected retry", async () => {
    setAccessToken("expired-token");

    let sessionCallCount = 0;
    let resolveRefresh: ((value: Response | PromiseLike<Response>) => void) | undefined;

    overrideHandler(
      http.get("*/api/chat/sessions", ({ request: _request }) => {
        sessionCallCount += 1;
        if (sessionCallCount === 1) {
          return apiError(
            { code: "unauthorized", message: "Authentication required." },
            { status: 401 },
          );
        }

        return apiResponse([{ id: 1, title: "Session A" }]);
      }),
    );

    overrideHandler(
      http.post("*/api/auth/refresh", () => {
        return new Promise((resolve) => {
          resolveRefresh = resolve;
        });
      }),
    );

    const protectedRequest = authenticatedFetch("http://localhost:8000/api/chat/sessions");
    const directRefreshRequest = refreshSession();

    await vi.waitFor(() => {
      expect(resolveRefresh).toBeDefined();
    });

    resolveRefresh?.(
      HttpResponse.json({
        success: true,
        data: {
          access_token: "fresh-token",
          expires_in: 900,
          token_type: "Bearer",
        },
        error: null,
      }),
    );

    const [protectedResponse, refreshedToken] = await Promise.all([
      protectedRequest,
      directRefreshRequest,
    ]);

    expect(refreshedToken).toBe("fresh-token");
    expect(getAccessToken()).toBe("fresh-token");
    expect(protectedResponse.status).toBe(200);
    await expect(protectedResponse.json()).resolves.toMatchObject({
      success: true,
      data: [{ id: 1, title: "Session A" }],
    });
    expect(sessionCallCount).toBe(2);
  });

  it("does not clear a newer session when an older protected retry fails refresh later", async () => {
    setAccessToken("stale-token");
    useSessionStore.getState().setStatus("authenticated");

    let resolveRefresh: ((value: Response | PromiseLike<Response>) => void) | undefined;

    overrideHandler(
      http.get("*/api/chat/sessions", () =>
        apiError({ code: "unauthorized", message: "Authentication required." }, { status: 401 }),
      ),
    );

    overrideHandler(
      http.post("*/api/auth/refresh", () => {
        return new Promise((resolve) => {
          resolveRefresh = resolve;
        });
      }),
    );

    const pendingRequest = authenticatedFetch("http://localhost:8000/api/chat/sessions");

    await vi.waitFor(() => {
      expect(resolveRefresh).toBeDefined();
    });

    setAccessToken("fresh-token");
    useSessionStore.getState().setStatus("authenticated");

    resolveRefresh?.(
      apiError(
        { code: "unauthorized", message: "Authentication required." },
        { status: 401, statusText: "Unauthorized" },
      ),
    );

    const response = await pendingRequest;

    expect(response.status).toBe(401);
    expect(getAccessToken()).toBe("fresh-token");
    expect(useSessionStore.getState().status).toBe("authenticated");
  });
});
