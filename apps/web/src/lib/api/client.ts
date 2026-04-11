/**
 * @file 全局 API 能力模块。
 */

import {
  classifyApiError,
  extractErrorDetail,
  getUserFacingErrorMessage,
  translateCommonErrorMessage,
} from "./error-response";
import { ApiRequestError } from "./api-request-error";
import { expireSessionIfStaleAccessToken } from "@/lib/auth/session-manager";
import { getAccessToken } from "@/lib/auth/token-store";
import { env } from "@/lib/config/env";

const responseAuthTokenSnapshots = new WeakMap<Response, string | null>();

export function buildApiUrl(path: string, apiBaseUrl: string = env.apiBaseUrl) {
  const normalizedBaseUrl = apiBaseUrl.endsWith("/") ? apiBaseUrl.slice(0, -1) : apiBaseUrl;
  if (!normalizedBaseUrl) {
    return path;
  }
  return `${normalizedBaseUrl}${path}`;
}

export function setResponseAuthTokenSnapshot(response: Response, accessToken: string | null) {
  responseAuthTokenSnapshots.set(response, accessToken);
}

export function getResponseAuthTokenSnapshot(response: Response) {
  return responseAuthTokenSnapshots.get(response) ?? null;
}

/**
 * 描述统一 API 响应包裹结构。
 */
type ApiEnvelope<T> = {
  success: boolean;
  data: T | null;
  error: { code?: string; message?: string } | null;
};

/**
 * 描述当前登录用户的数据结构。
 */
export type AppUser = {
  id: number;
  username: string;
  role: "admin" | "user";
  status: "active" | "disabled";
  theme_preference: "light" | "dark" | "system";
};

export { ApiRequestError } from "./api-request-error";

export function getApiErrorMessage(error: unknown) {
  if (error instanceof ApiRequestError) {
    const detail =
      error.code !== undefined
        ? {
            code: error.code,
            message: error.message,
            source: "status" as const,
          }
        : null;
    if (detail) {
      return getUserFacingErrorMessage(
        detail,
        new Response(null, {
          status: error.status,
        }),
      );
    }

    if (error.message.trim()) {
      return error.message.trim();
    }
  }

  if (error instanceof Error && error.message.trim()) {
    return error.message.trim();
  }

  return translateCommonErrorMessage("apiErrorGeneric");
}

function isAbortError(error: unknown): error is Error {
  return (
    typeof error === "object" && error !== null && "name" in error && error.name === "AbortError"
  );
}

function isNetworkError(error: unknown): error is TypeError {
  return error instanceof TypeError;
}

type OpenApiEnvelopeResult = Promise<{
  data?: unknown;
  error?: unknown;
  response: Response;
}>;

export async function openapiRequestRequired<T>(request: OpenApiEnvelopeResult): Promise<T> {
  let result: Awaited<OpenApiEnvelopeResult>;

  try {
    result = await request;
  } catch (error) {
    if (error instanceof ApiRequestError) {
      throw error;
    }

    if (isAbortError(error)) {
      throw new ApiRequestError(translateCommonErrorMessage("apiErrorGatewayTimeout"), {
        kind: "timeout",
        retryable: true,
        status: 504,
      });
    }

    if (isNetworkError(error)) {
      throw new ApiRequestError(translateCommonErrorMessage("apiErrorServiceUnavailable"), {
        kind: "network",
        retryable: true,
        status: 503,
      });
    }

    throw error;
  }

  const { data, error, response } = result;
  const payload = data as ApiEnvelope<T> | undefined;
  if (payload?.success) {
    if (payload.data === null) {
      throw new Error("API request returned empty data");
    }
    return payload.data;
  }

  const detail = extractErrorDetail("", error ?? payload ?? null, response);
  const classification = classifyApiError(response.status);
  const requestAccessToken = getResponseAuthTokenSnapshot(response);

  if (
    response.status === 401 &&
    detail.code === "unauthorized" &&
    requestAccessToken !== null &&
    requestAccessToken === getAccessToken()
  ) {
    expireSessionIfStaleAccessToken(requestAccessToken);
  }

  throw new ApiRequestError(getUserFacingErrorMessage(detail, response), {
    code: detail.code,
    kind: classification.kind,
    retryable: classification.retryable,
    status: response.status,
  });
}
