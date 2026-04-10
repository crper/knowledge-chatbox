/**
 * @file 带鉴权恢复的 fetch 封装模块。
 */

import { ApiRequestError, setResponseAuthTokenSnapshot } from "@/lib/api/client";
import {
  applyAuthenticatedAccessToken,
  expireSessionIfStaleAccessToken,
} from "@/lib/auth/session-manager";
import { useSessionStore } from "@/lib/auth/session-store";
import { getAccessToken } from "@/lib/auth/token-store";
import { env } from "@/lib/config/env";
import { extractErrorDetail, getUserFacingErrorMessage } from "./error-response";

const AUTH_ROUTE_PREFIX = "/api/auth/";
const AUTH_LOGIN_PATH = "/api/auth/login";
const AUTH_LOGOUT_PATH = "/api/auth/logout";
const AUTH_REFRESH_PATH = "/api/auth/refresh";

type RequestExecutor = (request: Request) => Promise<Response>;

let refreshInFlight: Promise<string> | null = null;

async function executeRequest(request: Request) {
  const contentType = request.headers.get("content-type") ?? "";
  const body =
    request.method === "GET" || request.method === "HEAD"
      ? undefined
      : contentType.includes("application/json")
        ? await request.clone().text()
        : request.body;

  return globalThis.fetch(request.url, {
    body,
    credentials: request.credentials,
    headers: request.headers,
    method: request.method,
    signal: request.signal,
  });
}

function resolveRequestPathname(url: string) {
  try {
    return new URL(url).pathname;
  } catch {
    try {
      const fallbackBase =
        env.apiBaseUrl ||
        (typeof globalThis.location?.origin === "string" ? globalThis.location.origin : undefined);

      return fallbackBase ? new URL(url, fallbackBase).pathname : url;
    } catch {
      return url;
    }
  }
}

function isProtectedRequest(url: string) {
  return !resolveRequestPathname(url).startsWith(AUTH_ROUTE_PREFIX);
}

function shouldRetryWithRefresh(url: string) {
  const pathname = resolveRequestPathname(url);
  return (
    pathname !== AUTH_LOGIN_PATH && pathname !== AUTH_LOGOUT_PATH && pathname !== AUTH_REFRESH_PATH
  );
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

function extractRequestAccessToken(request: Request) {
  const authorization = request.headers.get("Authorization")?.trim();
  if (!authorization) {
    return null;
  }

  const [scheme, token] = authorization.split(/\s+/, 2);
  if (scheme !== "Bearer" || !token) {
    return null;
  }

  return token;
}

function cloneRequestWithAccessToken(request: Request, accessToken: string) {
  const headers = new Headers(request.headers);
  headers.set("Authorization", `Bearer ${accessToken}`);
  return new Request(request, { headers });
}

function withAccessToken(request: Request) {
  const accessToken = getAccessToken();
  if (!accessToken) {
    return request;
  }

  return cloneRequestWithAccessToken(request, accessToken);
}

async function retryWithAccessTokenRefresh(
  requestSnapshot: Request,
  executeRequest: RequestExecutor,
) {
  const requestAccessToken = extractRequestAccessToken(requestSnapshot);

  try {
    const nextAccessToken = await requestAccessTokenRefresh();
    const retryRequest = cloneRequestWithAccessToken(requestSnapshot, nextAccessToken);
    const response = await executeRequest(retryRequest);
    setResponseAuthTokenSnapshot(response, nextAccessToken);
    return response;
  } catch {
    expireSessionIfStaleAccessToken(requestAccessToken);
    return null;
  }
}

export async function requestAccessTokenRefresh() {
  if (!refreshInFlight) {
    refreshInFlight = globalThis
      .fetch(`${env.apiBaseUrl}${AUTH_REFRESH_PATH}`, {
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

        applyAuthenticatedAccessToken(accessToken);
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
  const request = new Request(input, {
    ...init,
    credentials: init.credentials ?? "include",
  });
  const sessionStatus = useSessionStore.getState().status;

  if (
    isProtectedRequest(request.url) &&
    (sessionStatus === "anonymous" || sessionStatus === "expired")
  ) {
    return buildUnauthorizedResponse();
  }

  const authenticatedRequest = withAccessToken(request);
  const retryRequestSnapshot = shouldRetryWithRefresh(authenticatedRequest.url)
    ? authenticatedRequest.clone()
    : null;

  let response = await executeRequest(authenticatedRequest);
  setResponseAuthTokenSnapshot(response, extractRequestAccessToken(authenticatedRequest));
  if (response.status === 401 && retryRequestSnapshot) {
    const retryResponse = await retryWithAccessTokenRefresh(retryRequestSnapshot, executeRequest);
    if (retryResponse) {
      response = retryResponse;
    }
  }

  return response;
}
