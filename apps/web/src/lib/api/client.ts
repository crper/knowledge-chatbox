/**
 * @file 全局 API 能力模块。
 */

import { isAbortError } from "@/lib/utils";
import {
  classifyApiError,
  extractErrorDetail,
  getUserFacingErrorMessage,
  translateCommonErrorMessage,
} from "./error-response";
import { ApiRequestError } from "./api-request-error";
import { expireSessionIfStaleAccessToken } from "@/lib/auth/session-manager";
import { getAccessToken } from "@/lib/auth/token-store";

const responseAuthTokenSnapshots = new WeakMap<Response, string | null>();

export function setResponseAuthTokenSnapshot(response: Response, accessToken: string | null) {
  responseAuthTokenSnapshots.set(response, accessToken);
}

export function getResponseAuthTokenSnapshot(response: Response): string | null {
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

import type { components } from "@/lib/api/generated/schema";

type AuthUserRead = components["schemas"]["AuthUserRead"];

export type AppUser = Pick<
  AuthUserRead,
  "id" | "username" | "role" | "status" | "theme_preference"
>;

export { ApiRequestError } from "./api-request-error";

/**
 * 从原始响应体解析 Envelope 结构，成功时返回 data，失败时抛出 ApiRequestError。
 */
export function parseEnvelopeFromRawBody<T>(rawBody: string, response: Response): T {
  let parsedBody: unknown = null;

  if (rawBody.trim()) {
    try {
      parsedBody = JSON.parse(rawBody) as unknown;
    } catch {
      const detail = extractErrorDetail(rawBody, null, response);
      throw new ApiRequestError(getUserFacingErrorMessage(detail, response), {
        code: detail.code,
        status: response.status,
      });
    }
  }

  const payload = parsedBody as ApiEnvelope<T> | undefined;

  if (response.ok && payload?.success && payload.data !== null && payload.data !== undefined) {
    return payload.data;
  }

  const detail = extractErrorDetail(rawBody, parsedBody, response);
  throw new ApiRequestError(getUserFacingErrorMessage(detail, response), {
    code: detail.code,
    status: response.status,
  });
}

export function getApiErrorMessage(error: unknown) {
  if (error instanceof ApiRequestError) {
    if (error.message.trim()) {
      return error.message.trim();
    }
  }

  if (error instanceof Error && error.message.trim()) {
    return error.message.trim();
  }

  return translateCommonErrorMessage("apiErrorGeneric");
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

    if (error instanceof TypeError) {
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
