import { refreshSession } from "@/features/auth/api/auth";
import { getAccessToken, setAccessToken } from "@/lib/auth/token-store";
import { useSessionStore } from "@/lib/auth/session-store";
import { jsonResponse } from "@/test/http";
import { authenticatedFetch } from "./authenticated-fetch";

describe("authenticatedFetch", () => {
  const originalStatus = useSessionStore.getState().status;

  beforeEach(() => {
    useSessionStore.getState().setStatus("bootstrapping");
  });

  afterEach(() => {
    useSessionStore.getState().setStatus(originalStatus);
    setAccessToken(null);
    vi.unstubAllGlobals();
  });

  it("does not hit protected chat endpoints after the session is already marked expired", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse({
        success: true,
        data: [{ id: 1, title: "Session A" }],
        error: null,
      }),
    );
    vi.stubGlobal("fetch", fetchMock);
    useSessionStore.getState().setStatus("expired");

    const response = await authenticatedFetch("http://localhost:8000/api/chat/sessions");

    expect(fetchMock).not.toHaveBeenCalled();
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

    let refreshCallCount = 0;
    let sessionCallCount = 0;
    let resolveRefresh: ((value: Response | PromiseLike<Response>) => void) | undefined;

    const fetchMock = vi.fn().mockImplementation((input: string) => {
      if (input.endsWith("/api/chat/sessions")) {
        sessionCallCount += 1;
        if (sessionCallCount === 1) {
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
          jsonResponse({
            success: true,
            data: [{ id: 1, title: "Session A" }],
            error: null,
          }),
        );
      }

      if (input.endsWith("/api/auth/refresh")) {
        refreshCallCount += 1;
        return new Promise((resolve) => {
          resolveRefresh = resolve;
        });
      }

      return Promise.reject(new Error(`Unexpected request: ${input}`));
    });

    vi.stubGlobal("fetch", fetchMock);

    const protectedRequest = authenticatedFetch("http://localhost:8000/api/chat/sessions");
    const directRefreshRequest = refreshSession();

    await vi.waitFor(() => {
      expect(refreshCallCount).toBe(1);
    });

    resolveRefresh?.(
      jsonResponse({
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
    expect(refreshCallCount).toBe(1);
  });
});
