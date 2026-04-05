import { refreshSession } from "@/features/auth/api/auth";
import { getAccessToken, setAccessToken } from "@/lib/auth/token-store";
import { useSessionStore } from "@/lib/auth/session-store";
import { http, HttpResponse } from "msw";
import { apiResponse, apiError, overrideHandler } from "@/test/msw";
import { authenticatedFetch } from "./authenticated-fetch";

describe("authenticatedFetch", () => {
  const originalStatus = useSessionStore.getState().status;

  beforeEach(() => {
    useSessionStore.getState().setStatus("bootstrapping");
  });

  afterEach(() => {
    useSessionStore.getState().setStatus(originalStatus);
    setAccessToken(null);
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
});
