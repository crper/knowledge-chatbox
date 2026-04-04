/**
 * @file 带鉴权恢复的 fetch 封装模块。
 */

import { ApiRequestError } from "@/lib/api/client";
import { markSessionExpired } from "@/lib/auth/session-manager";
import { useSessionStore } from "@/lib/auth/session-store";
import { getAccessToken, setAccessToken } from "@/lib/auth/token-store";
import { env } from "@/lib/config/env";
import { extractErrorDetail, getUserFacingErrorMessage } from "./error-response";

let refreshInFlight: Promise<string> | null = null;

function shouldRetryWithRefresh(url: string) {
  return (
    !url.endsWith("/api/auth/login") &&
    !url.endsWith("/api/auth/logout") &&
    !url.endsWith("/api/auth/refresh")
  );
}

function shouldShortCircuitProtectedRequest(url: string) {
  return !url.includes("/api/auth/");
}

function buildUnauthorizedResponse() {
  return new Response(
    JSON.stringify({
      success: false,
      data: null,
      error: {
        code: "unauthorized",
        message: "Unauthorized",
      },
    }),
    {
      status: 401,
      headers: { "Content-Type": "application/json" },
    },
  );
}

export async function requestAccessTokenRefresh() {
  if (!refreshInFlight) {
    refreshInFlight = globalThis
      .fetch(`${env.apiBaseUrl}/api/auth/refresh`, {
        credentials: "include",
        method: "POST",
      })
      .then(async (response) => {
        if (!response.ok) {
          const rawBody = await response.text();
          let parsedBody: unknown = null;

          if (rawBody.trim()) {
            try {
              parsedBody = JSON.parse(rawBody) as unknown;
            } catch {
              parsedBody = null;
            }
          }

          const detail = extractErrorDetail(rawBody, parsedBody, response);
          throw new ApiRequestError(getUserFacingErrorMessage(detail, response), {
            code: detail.code,
            status: response.status,
          });
        }

        const payload = (await response.json()) as {
          data?: { access_token?: string };
          success?: boolean;
        };
        const accessToken = payload.data?.access_token;
        if (!payload.success || !accessToken) {
          throw new ApiRequestError("refresh failed", {
            status: 500,
          });
        }
        setAccessToken(accessToken);
        useSessionStore.getState().setStatus("authenticated");
        return accessToken;
      })
      .finally(() => {
        refreshInFlight = null;
      });
  }

  return refreshInFlight;
}

/**
 * 发送带 access token 的请求，并在 401 时自动刷新后重放一次。
 */
export async function authenticatedFetch(input: string, init: RequestInit = {}) {
  const sessionStatus = useSessionStore.getState().status;
  if (
    shouldShortCircuitProtectedRequest(input) &&
    (sessionStatus === "anonymous" || sessionStatus === "expired")
  ) {
    return buildUnauthorizedResponse();
  }

  const headers = new Headers(init.headers);
  const accessToken = getAccessToken();
  if (accessToken) {
    headers.set("Authorization", `Bearer ${accessToken}`);
  }

  const send = () =>
    globalThis.fetch(input, {
      ...init,
      credentials: init.credentials ?? "include",
      headers,
    });

  let response = await send();
  if (response.status === 401 && shouldRetryWithRefresh(input)) {
    try {
      const nextAccessToken = await requestAccessTokenRefresh();
      headers.set("Authorization", `Bearer ${nextAccessToken}`);
      response = await send();
    } catch {
      markSessionExpired();
    }
  }

  return response;
}
