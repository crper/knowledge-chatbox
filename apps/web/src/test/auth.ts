import type { AppUser } from "@/lib/api/client";
import { buildAppSettings } from "@/test/fixtures/app";
import { jsonResponse } from "@/test/http";

export type FetchHandler = (
  input: string,
  init?: RequestInit,
) => Promise<Response> | Response | undefined;

type CreateAuthFetchMockOptions = {
  user?: AppUser | null;
  status?: number;
  settings?: ReturnType<typeof buildAppSettings>;
  extraHandlers?: FetchHandler[];
};

export function createAuthFetchMock({
  user = null,
  status = user ? 200 : 401,
  settings = buildAppSettings({
    provider_profiles: {
      openai: {
        api_key: "",
      },
      ollama: {
        base_url: "http://localhost:11434",
      },
    },
  }),
  extraHandlers = [],
}: CreateAuthFetchMockOptions = {}) {
  return vi.fn().mockImplementation((input: string, init?: RequestInit) => {
    for (const handler of extraHandlers) {
      const response = handler(input, init);
      if (response !== undefined) {
        return response;
      }
    }

    if (input.endsWith("/api/auth/bootstrap")) {
      if (!user || status >= 400) {
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

      return Promise.resolve(
        jsonResponse({
          success: true,
          data: {
            authenticated: true,
            access_token: "refreshed-token",
            expires_in: 900,
            token_type: "Bearer",
            user,
          },
          error: null,
        }),
      );
    }

    if (input.endsWith("/api/auth/refresh")) {
      if (!user || status >= 400) {
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
          data: {
            access_token: "refreshed-token",
            expires_in: 900,
            token_type: "Bearer",
          },
          error: null,
        }),
      );
    }

    if (input.endsWith("/api/auth/me")) {
      return Promise.resolve(
        jsonResponse(
          {
            success: status < 400,
            data: user,
            error: status < 400 ? null : { code: "unauthorized" },
          },
          { status },
        ),
      );
    }

    if (input.endsWith("/api/settings")) {
      return Promise.resolve(
        jsonResponse({
          success: true,
          data: settings,
          error: null,
        }),
      );
    }

    throw new Error(`Unexpected request: ${input}`);
  });
}
