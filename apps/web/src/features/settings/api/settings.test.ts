import { http } from "msw";
import { buildAppSettings, buildProviderConnectionResult } from "@/test/fixtures/app";
import { apiResponse, overrideHandler } from "@/test/msw";
import { getSettings, testProviderConnection, updateSettings } from "./settings";

vi.mock("@/lib/config/env", () => ({
  env: { apiBaseUrl: "http://localhost:8000" },
}));

describe("settings api", () => {
  it("loads capability-first settings", async () => {
    overrideHandler(
      http.get("*/api/settings", () => {
        return apiResponse(
          buildAppSettings({
            pending_embedding_route: { provider: "voyage", model: "voyage-3.5" },
            system_prompt: "prompt",
            updated_by_user_id: null,
            updated_at: "2026-03-19T08:00:00Z",
            building_index_generation: 4,
            index_rebuild_status: "running",
            reindex_required: true,
          }),
        );
      }),
    );

    const result = await getSettings();

    expect(result.response_route.provider).toBe("openai");
    expect(result.embedding_route.model).toBe("text-embedding-3-small");
    expect(result.pending_embedding_route?.provider).toBe("voyage");
    expect(result.index_rebuild_status).toBe("running");
  });

  it("updates settings with route payload", async () => {
    overrideHandler(
      http.put("*/api/settings", () => {
        return apiResponse(
          buildAppSettings({
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
        );
      }),
    );

    const result = await updateSettings({
      response_route: { provider: "anthropic", model: "claude-sonnet-4-5" },
      embedding_route: { provider: "voyage", model: "voyage-3.5" },
      vision_route: { provider: "anthropic", model: "claude-sonnet-4-5" },
      system_prompt: "",
    });

    expect(result.rebuild_started).toBe(true);
    expect(result.pending_embedding_route?.provider).toBe("voyage");
  });

  it("tests all capability routes", async () => {
    overrideHandler(
      http.post("*/api/settings/test-routes", () => {
        return apiResponse(
          buildProviderConnectionResult({
            response: { provider: "anthropic", model: "claude-sonnet-4-5" },
            embedding: { provider: "voyage", model: "voyage-3.5" },
            vision: { provider: "anthropic", model: "claude-sonnet-4-5" },
          }),
        );
      }),
    );

    const result = await testProviderConnection({
      response_route: { provider: "anthropic", model: "claude-sonnet-4-5" },
      embedding_route: { provider: "voyage", model: "voyage-3.5" },
      vision_route: { provider: "anthropic", model: "claude-sonnet-4-5" },
    });

    expect(result.response.healthy).toBe(true);
    expect(result.embedding.provider).toBe("voyage");
  });
});
