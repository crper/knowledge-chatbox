import { beforeEach, describe, expect, it, vi } from "vite-plus/test";

import { buildAppSettings, buildProviderConnectionResult } from "@/test/fixtures/app";
import { getSettings, testProviderConnection, updateSettings } from "./settings";

vi.mock("@/lib/config/env", () => ({
  env: { apiBaseUrl: "http://localhost:8000" },
}));

describe("settings api", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("loads capability-first settings", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          success: true,
          data: buildAppSettings({
            pending_embedding_route: { provider: "voyage", model: "voyage-3.5" },
            system_prompt: "prompt",
            updated_by_user_id: null,
            updated_at: "2026-03-19T08:00:00Z",
            building_index_generation: 4,
            index_rebuild_status: "running",
            reindex_required: true,
          }),
          error: null,
        }),
      ),
    );

    const result = await getSettings();

    expect(result.response_route.provider).toBe("openai");
    expect(result.embedding_route.model).toBe("text-embedding-3-small");
    expect(result.pending_embedding_route?.provider).toBe("voyage");
    expect(result.index_rebuild_status).toBe("running");
  });

  it("updates settings with route payload", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          success: true,
          data: buildAppSettings({
            provider_profiles: {
              anthropic: { api_key: "********" },
              voyage: { api_key: "********" },
            },
            response_route: { provider: "anthropic", model: "claude-sonnet-4-5" },
            pending_embedding_route: { provider: "voyage", model: "voyage-3.5" },
            vision_route: { provider: "anthropic", model: "claude-sonnet-4-5" },
            system_prompt: "",
            updated_by_user_id: null,
            updated_at: "2026-03-19T08:00:00Z",
            building_index_generation: 4,
            index_rebuild_status: "running",
            rebuild_started: true,
            reindex_required: true,
          }),
          error: null,
        }),
      ),
    );

    const result = await updateSettings({
      response_route: { provider: "anthropic", model: "claude-sonnet-4-5" },
      embedding_route: { provider: "voyage", model: "voyage-3.5" },
      vision_route: { provider: "anthropic", model: "claude-sonnet-4-5" },
      system_prompt: "",
    });

    expect(fetchSpy).toHaveBeenCalledWith(
      "http://localhost:8000/api/settings",
      expect.objectContaining({
        body: expect.stringContaining('"response_route"'),
        method: "PUT",
      }),
    );
    expect(result.rebuild_started).toBe(true);
    expect(result.pending_embedding_route?.provider).toBe("voyage");
  });

  it("tests all capability routes", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          success: true,
          data: buildProviderConnectionResult({
            response: { provider: "anthropic", model: "claude-sonnet-4-5" },
            embedding: { provider: "voyage", model: "voyage-3.5" },
            vision: { provider: "anthropic", model: "claude-sonnet-4-5" },
          }),
          error: null,
        }),
      ),
    );

    const result = await testProviderConnection({
      response_route: { provider: "anthropic", model: "claude-sonnet-4-5" },
      embedding_route: { provider: "voyage", model: "voyage-3.5" },
      vision_route: { provider: "anthropic", model: "claude-sonnet-4-5" },
    });

    expect(fetchSpy).toHaveBeenCalledWith(
      "http://localhost:8000/api/settings/test-routes",
      expect.objectContaining({
        body: expect.stringContaining('"response_route"'),
        method: "POST",
      }),
    );
    expect(result.response.healthy).toBe(true);
    expect(result.embedding.provider).toBe("voyage");
  });
});
