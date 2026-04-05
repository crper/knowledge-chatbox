import { http } from "msw";
import type { AppUser } from "@/lib/api/client";
import { apiResponse, apiError } from "./utils";

type AuthHandlersOptions = {
  user?: AppUser | null;
  authenticated?: boolean;
};

export function createAuthHandlers(options: AuthHandlersOptions = {}) {
  const { user = null, authenticated = false } = options;

  return [
    http.post("*/api/auth/bootstrap", () => {
      if (!authenticated || !user) {
        return apiResponse({
          authenticated: false,
          access_token: null,
          expires_in: null,
          token_type: "Bearer",
          user: null,
        });
      }

      return apiResponse({
        authenticated: true,
        access_token: "test-token",
        expires_in: 900,
        token_type: "Bearer",
        user,
      });
    }),

    http.get("*/api/auth/me", () => {
      if (!authenticated || !user) {
        return apiError(
          { code: "unauthorized", message: "Authentication required." },
          { status: 401 },
        );
      }

      return apiResponse(user);
    }),

    http.post("*/api/auth/refresh", () => {
      if (!authenticated || !user) {
        return apiError(
          { code: "unauthorized", message: "Authentication required." },
          { status: 401 },
        );
      }

      return apiResponse({
        access_token: "refreshed-token",
        expires_in: 900,
        token_type: "Bearer",
      });
    }),

    http.post("*/api/auth/login", async ({ request }) => {
      const body = (await request.json()) as { username?: string; password?: string };

      if (!body?.username || !body?.password) {
        return apiError(
          { code: "validation_error", message: "Username and password are required." },
          { status: 422 },
        );
      }

      if (body.username === "admin" && body.password === "password") {
        return apiResponse({
          authenticated: true,
          access_token: "test-token",
          expires_in: 900,
          token_type: "Bearer",
          user: {
            id: 1,
            username: "admin",
            role: "admin",
            status: "active",
            theme_preference: "system",
          },
        });
      }

      return apiError({ code: "unauthorized", message: "Invalid credentials." }, { status: 401 });
    }),

    http.post("*/api/auth/logout", () => {
      return apiResponse({ success: true });
    }),
  ];
}
