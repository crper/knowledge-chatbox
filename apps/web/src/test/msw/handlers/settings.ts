import { http } from "msw";
import type { AppSettings } from "@/features/settings/api/settings";
import { buildAppSettings } from "@/test/fixtures/app";
import { apiResponse } from "./utils";

type SettingsHandlersOptions = {
  settings?: Partial<AppSettings>;
};

export function createSettingsHandlers(options: SettingsHandlersOptions = {}) {
  const settings = buildAppSettings(options.settings);

  return [
    http.get("*/api/settings", () => {
      return apiResponse(settings);
    }),

    http.put("*/api/settings", async ({ request }) => {
      const body = (await request.json()) as Partial<AppSettings>;
      return apiResponse({ ...settings, ...body });
    }),

    http.patch("*/api/settings", async ({ request }) => {
      const body = (await request.json()) as Partial<AppSettings>;
      return apiResponse({ ...settings, ...body });
    }),

    http.post("*/api/settings/test-routes", async ({ request: _request }) => {
      void (await _request.json());
      return apiResponse({
        response: {
          provider: "openai",
          model: "gpt-5.4",
          healthy: true,
          message: "ok",
          latency_ms: 10,
        },
        embedding: {
          provider: "openai",
          model: "text-embedding-3-small",
          healthy: true,
          message: "ok",
          latency_ms: 10,
        },
        vision: {
          provider: "openai",
          model: "gpt-5.4",
          healthy: true,
          message: "ok",
          latency_ms: 10,
        },
      });
    }),

    http.post("*/api/settings/reindex", () => {
      return apiResponse({ success: true });
    }),

    http.get("*/api/settings/reindex-status", () => {
      return apiResponse({
        status: "idle",
        progress: 0,
        total: 0,
      });
    }),
  ];
}
