import createFetchClient from "openapi-fetch";

import { authenticatedFetch } from "@/lib/api/authenticated-fetch";
import { resolveApiBaseUrl } from "@/lib/config/env";

import type { components, paths } from "./schema";

export type { components, paths } from "./schema";

export type ApiComponents = components;

export const apiFetchClient = createFetchClient<paths>({
  baseUrl: resolveApiBaseUrl(),
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
