import { MutationObserver } from "@tanstack/react-query";

import { queryKeys } from "@/lib/api/query-keys";
import { createTestQueryClient } from "@/test/query-client";
import { updateSettingsMutationOptions } from "./settings-query";
import * as settingsApi from "./settings";

vi.mock("./settings", async () => {
  const actual = await vi.importActual<typeof import("./settings")>("./settings");

  return {
    ...actual,
    updateSettings: vi.fn(),
  };
});

describe("settings-query", () => {
  it("invalidates settings and chat profile queries after provider settings are saved", async () => {
    vi.mocked(settingsApi.updateSettings).mockResolvedValue({
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
          base_url: "http://host.docker.internal:11434",
          chat_model: "qwen3.5:4b",
          embedding_model: "nomic-embed-text",
          vision_model: "qwen3.5:4b",
        },
      },
      response_route: { provider: "openai", model: "gpt-5.4" },
      embedding_route: { provider: "openai", model: "text-embedding-3-small" },
      pending_embedding_route: null,
      vision_route: { provider: "openai", model: "gpt-5.4" },
      system_prompt: "prompt",
      provider_timeout_seconds: 60,
    });

    const queryClient = createTestQueryClient({
      defaultOptions: {
        queries: {
          retry: false,
        },
      },
    });
    const invalidateQueries = vi.spyOn(queryClient, "invalidateQueries");
    const observer = new MutationObserver(queryClient, updateSettingsMutationOptions(queryClient));

    await observer.mutate({});

    expect(invalidateQueries).toHaveBeenCalledWith({
      queryKey: queryKeys.settings.all,
    });
    expect(invalidateQueries).toHaveBeenCalledWith({
      queryKey: queryKeys.chat.profile,
    });
  });
});
