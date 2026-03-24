import { useSessionStore } from "@/lib/auth/session-store";
import { setAccessToken } from "@/lib/auth/token-store";
import { jsonResponse } from "@/test/http";
import { createTestQueryClient } from "@/test/query-client";
import { bootstrapSession } from "./session-manager";

describe("session-manager", () => {
  beforeEach(() => {
    setAccessToken(null);
    useSessionStore.getState().reset();
    vi.unstubAllGlobals();
  });

  it("marks the session anonymous when bootstrap endpoint reports no active session", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockImplementation((input: string) => {
        if (input.endsWith("/api/auth/bootstrap")) {
          return Promise.resolve(
            jsonResponse({
              success: true,
              data: {
                authenticated: false,
                access_token: null,
                expires_in: null,
                token_type: "Bearer",
                user: null,
              },
              error: null,
            }),
          );
        }

        return Promise.reject(new Error(`Unexpected request: ${input}`));
      }),
    );

    const queryClient = createTestQueryClient({
      defaultOptions: {
        queries: {
          retry: false,
        },
      },
    });

    await expect(bootstrapSession(queryClient)).resolves.toBeNull();
    expect(useSessionStore.getState().status).toBe("anonymous");
  });
});
