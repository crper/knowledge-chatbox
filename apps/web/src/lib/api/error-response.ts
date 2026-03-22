/**
 * @file 统一处理 API 错误响应解析与文案映射。
 */

import { i18n } from "@/i18n";

const ERROR_CODE_MESSAGE_KEYS = {
  conflict: "apiErrorConflict",
  document_file_not_found: "apiErrorFileNotFound",
  document_not_found: "apiErrorNotFound",
  forbidden: "apiErrorForbidden",
  invalid_credentials: "apiErrorInvalidCredentials",
  invalid_document: "apiErrorInvalidDocument",
  provider_timeout: "apiErrorGatewayTimeout",
  rate_limited: "apiErrorRateLimited",
  unauthorized: "apiErrorUnauthorized",
  unsupported_file_type: "apiErrorUnsupportedMediaType",
  validation_error: "apiErrorValidation",
} as const;

const STATUS_MESSAGE_KEYS = {
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

export function getUserFacingErrorMessage(detail: ErrorDetail, response: Response) {
  if (detail.code === "invalid_credentials") {
    return translateCommonErrorMessage("apiErrorInvalidCredentials");
  }

  if (detail.code === "unauthorized" || response.status === 401) {
    return translateCommonErrorMessage("apiErrorUnauthorized");
  }

  if (detail.code === "forbidden" || response.status === 403) {
    return translateCommonErrorMessage("apiErrorForbidden");
  }

  if (detail.source === "payload" && detail.message.trim()) {
    return detail.message.trim();
  }

  const mappedCodeKey =
    detail.code && detail.code in ERROR_CODE_MESSAGE_KEYS
      ? ERROR_CODE_MESSAGE_KEYS[detail.code as keyof typeof ERROR_CODE_MESSAGE_KEYS]
      : undefined;
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

export function extractErrorDetail(
  rawBody: string,
  parsedBody: unknown,
  response: Pick<Response, "status" | "statusText">,
): ErrorDetail {
  if (
    parsedBody &&
    typeof parsedBody === "object" &&
    "error" in parsedBody &&
    parsedBody.error &&
    typeof parsedBody.error === "object" &&
    "message" in parsedBody.error &&
    typeof parsedBody.error.message === "string"
  ) {
    const code =
      "code" in parsedBody.error && typeof parsedBody.error.code === "string"
        ? parsedBody.error.code
        : undefined;
    return { code, message: parsedBody.error.message, source: "payload" };
  }

  if (
    parsedBody &&
    typeof parsedBody === "object" &&
    "detail" in parsedBody &&
    parsedBody.detail &&
    typeof parsedBody.detail === "object" &&
    "message" in parsedBody.detail &&
    typeof parsedBody.detail.message === "string"
  ) {
    const code =
      "code" in parsedBody.detail && typeof parsedBody.detail.code === "string"
        ? parsedBody.detail.code
        : undefined;
    return { code, message: parsedBody.detail.message, source: "payload" };
  }

  if (rawBody.trim()) {
    return { message: rawBody.trim(), source: "raw" };
  }

  return { message: `${response.status} ${response.statusText}`.trim(), source: "status" };
}
