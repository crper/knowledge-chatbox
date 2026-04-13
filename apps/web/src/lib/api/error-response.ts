/**
 * @file 统一处理 API 错误响应解析与文案映射。
 */

import { i18n } from "@/i18n";

import { ApiRequestError } from "./api-request-error";

export function classifyApiError(status: number): Pick<ApiRequestError, "kind" | "retryable"> {
  if (status === 401) {
    return { kind: "unauthorized", retryable: false };
  }

  if (status === 403) {
    return { kind: "forbidden", retryable: false };
  }

  if (status === 422) {
    return { kind: "validation", retryable: false };
  }

  if (status === 408 || status === 504) {
    return { kind: "timeout", retryable: true };
  }

  if (status === 429 || status >= 500) {
    return { kind: "server", retryable: true };
  }

  return { kind: "unknown", retryable: false };
}

const ERROR_CODE_MESSAGE_KEYS: Record<string, string> = {
  conflict: "apiErrorConflict",
  document_file_not_found: "apiErrorFileNotFound",
  document_not_found: "apiErrorNotFound",
  embedding_not_configured: "apiErrorEmbeddingNotConfigured",
  forbidden: "apiErrorForbidden",
  invalid_credentials: "apiErrorInvalidCredentials",
  invalid_document: "apiErrorInvalidDocument",
  pending_embedding_not_configured: "apiErrorPendingEmbeddingNotConfigured",
  provider_timeout: "apiErrorGatewayTimeout",
  rate_limited: "apiErrorRateLimited",
  unauthorized: "apiErrorUnauthorized",
  unsupported_file_type: "apiErrorUnsupportedMediaType",
  validation_error: "apiErrorValidation",
};

export const STATUS_MESSAGE_KEYS = {
  400: "apiErrorBadRequest",
  401: "apiErrorUnauthorized",
  403: "apiErrorForbidden",
  404: "apiErrorNotFound",
  409: "apiErrorConflict",
  413: "apiErrorPayloadTooLarge",
  415: "apiErrorUnsupportedMediaType",
  422: "apiErrorValidation",
  429: "apiErrorRateLimited",
  500: "apiErrorServer",
  502: "apiErrorBadGateway",
  503: "apiErrorServiceUnavailable",
  504: "apiErrorGatewayTimeout",
} as const;

export type ErrorDetail = {
  code?: string;
  message: string;
  source: "payload" | "raw" | "status";
};

export function translateCommonErrorMessage(key: string) {
  return i18n.t(key, { ns: "common" });
}

const PRIORITY_I18N_CODES = new Set([
  "embedding_not_configured",
  "forbidden",
  "invalid_credentials",
  "pending_embedding_not_configured",
  "unauthorized",
]);

export function getUserFacingErrorMessage(detail: ErrorDetail, response: Response) {
  if (detail.code && PRIORITY_I18N_CODES.has(detail.code)) {
    const mappedKey = ERROR_CODE_MESSAGE_KEYS[detail.code];
    if (mappedKey) {
      return translateCommonErrorMessage(mappedKey);
    }
  }

  if (response.status === 401 || response.status === 403) {
    const mappedStatusKey =
      STATUS_MESSAGE_KEYS[response.status as keyof typeof STATUS_MESSAGE_KEYS];
    if (mappedStatusKey) {
      return translateCommonErrorMessage(mappedStatusKey);
    }
  }

  if (detail.source === "payload" && detail.message.trim()) {
    return detail.message.trim();
  }

  const mappedCodeKey = detail.code ? ERROR_CODE_MESSAGE_KEYS[detail.code] : undefined;
  if (mappedCodeKey) {
    return translateCommonErrorMessage(mappedCodeKey);
  }

  const mappedStatusKey = STATUS_MESSAGE_KEYS[response.status as keyof typeof STATUS_MESSAGE_KEYS];
  if (mappedStatusKey) {
    return translateCommonErrorMessage(mappedStatusKey);
  }

  if (detail.message.trim()) {
    return detail.message.trim();
  }

  return translateCommonErrorMessage("apiErrorGeneric");
}

function extractNestedMessage(body: unknown, key: string): ErrorDetail | null {
  if (!body || typeof body !== "object" || !(key in body)) {
    return null;
  }

  const container = (body as Record<string, unknown>)[key];
  if (!container || typeof container !== "object") {
    return null;
  }

  if (!("message" in container) || typeof container.message !== "string") {
    return null;
  }

  const code =
    "code" in container && typeof container.code === "string" ? container.code : undefined;
  return { code, message: container.message, source: "payload" };
}

export function extractErrorDetail(
  rawBody: string,
  parsedBody: unknown,
  response: Pick<Response, "status" | "statusText">,
): ErrorDetail {
  const fromError = extractNestedMessage(parsedBody, "error");
  if (fromError) return fromError;

  const fromDetail = extractNestedMessage(parsedBody, "detail");
  if (fromDetail) return fromDetail;

  if (rawBody.trim()) {
    return { message: rawBody.trim(), source: "raw" };
  }

  return { message: `${response.status} ${response.statusText}`.trim(), source: "status" };
}

export async function parseErrorResponse(response: Response): Promise<never> {
  const rawBody = await response.text();
  let parsedBody: unknown = null;

  try {
    parsedBody = rawBody.trim() ? (JSON.parse(rawBody) as unknown) : null;
  } catch {
    parsedBody = null;
  }

  const detail = extractErrorDetail(rawBody, parsedBody, response);
  const classification = classifyApiError(response.status);
  throw new ApiRequestError(getUserFacingErrorMessage(detail, response), {
    code: detail.code,
    kind: classification.kind,
    retryable: classification.retryable,
    status: response.status,
  });
}
