import { beforeEach, describe, expect, it, vi } from "vite-plus/test";

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
          data: {
            id: 1,
            provider_profiles: {
              openai: {
                api_key: "********",
                base_url: "https://api.openai.com/v1",
                chat_model: "gpt-5.4",
                embedding_model: "text-embedding-3-small",
                vision_model: "gpt-5.4",
              },
              anthropic: {
                api_key: null,
                base_url: "https://api.anthropic.com",
                chat_model: "claude-sonnet-4-5",
                vision_model: "claude-sonnet-4-5",
              },
              voyage: {
                api_key: null,
                base_url: "https://api.voyageai.com/v1",
                embedding_model: "voyage-3.5",
              },
              ollama: {
                api_key: null,
                base_url: "http://localhost:11434",
                chat_model: "qwen3.5:4b",
                embedding_model: "nomic-embed-text",
                vision_model: "qwen3.5:4b",
              },
            },
            response_route: { provider: "openai", model: "gpt-5.4" },
            embedding_route: { provider: "openai", model: "text-embedding-3-small" },
            pending_embedding_route: { provider: "voyage", model: "voyage-3.5" },
            vision_route: { provider: "openai", model: "gpt-5.4" },
            system_prompt: "prompt",
            provider_timeout_seconds: 60,
            updated_by_user_id: null,
            updated_at: "2026-03-19T08:00:00Z",
            active_index_generation: 3,
            building_index_generation: 4,
            index_rebuild_status: "running",
            rebuild_started: false,
            reindex_required: true,
          },
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
          data: {
            id: 1,
            provider_profiles: {
              openai: {
                api_key: "********",
                base_url: "https://api.openai.com/v1",
                chat_model: "gpt-5.4",
                embedding_model: "text-embedding-3-small",
                vision_model: "gpt-5.4",
              },
              anthropic: {
                api_key: "********",
                base_url: "https://api.anthropic.com",
                chat_model: "claude-sonnet-4-5",
                vision_model: "claude-sonnet-4-5",
              },
              voyage: {
                api_key: "********",
                base_url: "https://api.voyageai.com/v1",
                embedding_model: "voyage-3.5",
              },
              ollama: {
                api_key: null,
                base_url: "http://localhost:11434",
                chat_model: "qwen3.5:4b",
                embedding_model: "nomic-embed-text",
                vision_model: "qwen3.5:4b",
              },
            },
            response_route: { provider: "anthropic", model: "claude-sonnet-4-5" },
            embedding_route: { provider: "openai", model: "text-embedding-3-small" },
            pending_embedding_route: { provider: "voyage", model: "voyage-3.5" },
            vision_route: { provider: "anthropic", model: "claude-sonnet-4-5" },
            system_prompt: "",
            provider_timeout_seconds: 60,
            updated_by_user_id: null,
            updated_at: "2026-03-19T08:00:00Z",
            active_index_generation: 3,
            building_index_generation: 4,
            index_rebuild_status: "running",
            rebuild_started: true,
            reindex_required: true,
          },
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
          data: {
            response: {
              provider: "anthropic",
              model: "claude-sonnet-4-5",
              healthy: true,
              message: "ok",
            },
            embedding: {
              provider: "voyage",
              model: "voyage-3.5",
              healthy: true,
              message: "ok",
            },
            vision: {
              provider: "anthropic",
              model: "claude-sonnet-4-5",
              healthy: true,
              message: "ok",
            },
          },
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
