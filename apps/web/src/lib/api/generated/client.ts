import createFetchClient from "openapi-fetch";

import { authenticatedFetch } from "@/lib/api/authenticated-fetch";
import { env } from "@/lib/config/env";

import type { components, paths } from "./schema";

export type { components, paths } from "./schema";

export type ApiComponents = components;

function resolveApiClientBaseUrl(apiBaseUrl: string) {
  if (apiBaseUrl) {
    return apiBaseUrl;
  }

  if (typeof globalThis.location?.origin === "string" && globalThis.location.origin) {
    return globalThis.location.origin;
  }

  return "http://localhost";
}

export const apiFetchClient = createFetchClient<paths>({
  baseUrl: resolveApiClientBaseUrl(env.apiBaseUrl),
  credentials: "include",
  fetch: async (request) => {
    const contentType = request.headers.get("content-type") ?? "";
    const body =
      request.method === "GET" || request.method === "HEAD"
        ? undefined
        : contentType.includes("application/json")
          ? await request.clone().text()
          : request.body;
    return authenticatedFetch(request.url, {
      body,
      credentials: request.credentials,
      headers: request.headers,
      method: request.method,
      signal: request.signal,
    });
  },
});
