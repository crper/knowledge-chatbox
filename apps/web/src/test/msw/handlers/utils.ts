import { HttpResponse } from "msw";

type ApiEnvelope<T> = {
  success: boolean;
  data: T | null;
  error: { code?: string; message?: string } | null;
};

export function apiResponse<T>(data: T, init?: ResponseInit): Response {
  return HttpResponse.json<ApiEnvelope<T>>({ success: true, data, error: null }, init);
}

export function apiError(
  error: { code?: string; message?: string },
  init?: ResponseInit,
): Response {
  return HttpResponse.json<ApiEnvelope<null>>({ success: false, data: null, error }, init);
}
