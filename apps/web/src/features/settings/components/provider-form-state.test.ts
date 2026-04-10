import {
  buildProviderSettingsView,
  toSettingsPayload,
  updatePrimaryProvider,
  toggleRetrievalOverride,
  getPrimaryChatModel,
  getPrimaryVisionModel,
  getDefaultEmbeddingModel,
  getRetrievalEmbeddingModel,
} from "./provider-form-state";
import { validateProviderSettingsForm } from "./provider-form.validation";
import type { AppSettings } from "../api/settings";

function buildSettings(overrides: Partial<AppSettings> = {}): AppSettings {
  const base: AppSettings = {
    active_index_generation: 1,
    building_index_generation: null,
    embedding_route: { provider: "openai", model: "text-embedding-3-small" },
    id: 1,
    index_rebuild_status: "idle",
    pending_embedding_route: null,
    provider_profiles: {
      anthropic: {
        api_key: null,
        base_url: "https://api.anthropic.com",
        chat_model: "claude-sonnet-4-5",
        vision_model: "claude-sonnet-4-5",
      },
      ollama: {
        base_url: "http://localhost:11434",
        chat_model: "qwen3.5:4b",
        embedding_model: "nomic-embed-text",
        vision_model: "qwen3.5:4b",
      },
      openai: {
        api_key: "********",
        base_url: "https://api.openai.com/v1",
        chat_model: "gpt-5.4",
        embedding_model: "text-embedding-3-small",
        vision_model: "gpt-5.4",
      },
      voyage: {
        api_key: null,
        base_url: "https://api.voyageai.com/v1",
        embedding_model: "voyage-3.5",
      },
    },
    provider_timeout_seconds: 60,
    response_route: { provider: "openai", model: "gpt-5.4" },
    system_prompt: "",
    vision_route: { provider: "openai", model: "gpt-5.4" },
  };

  return {
    ...base,
    ...overrides,
    provider_profiles: {
      ...base.provider_profiles,
      ...overrides.provider_profiles,
      anthropic: {
        ...base.provider_profiles.anthropic,
        ...overrides.provider_profiles?.anthropic,
      },
      ollama: {
        ...base.provider_profiles.ollama,
        ...overrides.provider_profiles?.ollama,
      },
      openai: {
        ...base.provider_profiles.openai,
        ...overrides.provider_profiles?.openai,
      },
      voyage: {
        ...base.provider_profiles.voyage,
        ...overrides.provider_profiles?.voyage,
      },
    },
    embedding_route: {
      ...base.embedding_route,
      ...overrides.embedding_route,
    },
    response_route: {
      ...base.response_route,
      ...overrides.response_route,
    },
    vision_route: {
      ...base.vision_route,
      ...overrides.vision_route,
    },
  };
}

describe("provider-form-state validation", () => {
  it("returns structured base-url and timeout errors for the active provider", () => {
    const view = buildProviderSettingsView(
      buildSettings({
        provider_profiles: {
          openai: {
            base_url: "api.openai.com/v1",
          },
        } as AppSettings["provider_profiles"],
        provider_timeout_seconds: 601,
      }),
    );

    const result = validateProviderSettingsForm({
      ...view,
      providerTimeoutSeconds: 601,
      providerProfiles: {
        ...view.providerProfiles,
        openai: {
          ...view.providerProfiles.openai,
          base_url: "api.openai.com/v1",
        },
      },
    });

    expect(result).toMatchObject({
      fields: {
        primaryBaseUrl: { i18nKey: "settings:baseUrlInvalidError" },
        providerTimeoutSeconds: { i18nKey: "settings:providerTimeoutInvalidError" },
      },
      form: { i18nKey: "settings:providerValidationSummaryError" },
    });
  });

  it("rejects malformed http urls even when they include a protocol prefix", () => {
    const malformedUrls = [
      "http://exa mple.com",
      "http://[::1",
      "https://foo bar/baz",
      "http://:80",
    ];

    for (const baseUrl of malformedUrls) {
      const view = buildProviderSettingsView(
        buildSettings({
          provider_profiles: {
            openai: {
              base_url: baseUrl,
            },
          } as AppSettings["provider_profiles"],
        }),
      );

      expect(
        validateProviderSettingsForm({
          ...view,
          providerProfiles: {
            ...view.providerProfiles,
            openai: {
              ...view.providerProfiles.openai,
              base_url: baseUrl,
            },
          },
        }),
      ).toMatchObject({
        fields: {
          primaryBaseUrl: { i18nKey: "settings:baseUrlInvalidError" },
        },
      });
    }
  });

  it("allows an empty OpenAI base url but requires one for Ollama", () => {
    const openAiView = buildProviderSettingsView(
      buildSettings({
        provider_profiles: {
          openai: {
            base_url: "",
          },
        } as AppSettings["provider_profiles"],
      }),
    );

    expect(
      validateProviderSettingsForm({
        ...openAiView,
        providerProfiles: {
          ...openAiView.providerProfiles,
          openai: { ...openAiView.providerProfiles.openai, base_url: "" },
        },
      }),
    ).toBeUndefined();

    const ollamaView = buildProviderSettingsView(
      buildSettings({
        response_route: { provider: "ollama", model: "qwen3.5:4b" },
        embedding_route: { provider: "ollama", model: "nomic-embed-text" },
        vision_route: { provider: "ollama", model: "qwen3.5:4b" },
        provider_profiles: {
          ollama: {
            base_url: "",
          },
        } as AppSettings["provider_profiles"],
      }),
    );

    expect(
      validateProviderSettingsForm({
        ...ollamaView,
        providerProfiles: {
          ...ollamaView.providerProfiles,
          ollama: { ...ollamaView.providerProfiles.ollama, base_url: "" },
        },
      }),
    ).toMatchObject({
      fields: {
        primaryBaseUrl: { i18nKey: "settings:providerTestOllamaBaseUrlMissing" },
      },
    });
  });

  it("requires retrieval embedding model only when override is enabled", () => {
    const view = buildProviderSettingsView(buildSettings());

    expect(
      validateProviderSettingsForm({
        ...view,
        retrievalOverrideEnabled: false,
      }),
    ).toBeUndefined();

    expect(
      validateProviderSettingsForm({
        ...view,
        retrievalOverrideEnabled: true,
        retrievalProvider: "voyage",
        providerProfiles: {
          ...view.providerProfiles,
          voyage: {
            ...view.providerProfiles.voyage,
            embedding_model: "",
          },
        },
      }),
    ).toMatchObject({
      fields: {
        retrievalEmbeddingModel: { i18nKey: "settings:retrievalEmbeddingModelRequiredError" },
      },
    });
  });

  it("derives payload routes from provider profiles instead of mirrored draft fields", () => {
    const view = buildProviderSettingsView(
      buildSettings({
        pending_embedding_route: { provider: "voyage", model: "voyage-3.5" },
      }),
    );

    const payload = toSettingsPayload({
      ...view,
      providerProfiles: {
        ...view.providerProfiles,
        openai: {
          ...view.providerProfiles.openai,
          chat_model: "gpt-5.4-mini",
          vision_model: "gpt-5.4-vision",
        },
        voyage: {
          ...view.providerProfiles.voyage,
          embedding_model: "voyage-3.5-lite",
        },
      },
    });

    expect(payload).toMatchObject({
      response_route: { provider: "openai", model: "gpt-5.4-mini" },
      embedding_route: { provider: "voyage", model: "voyage-3.5-lite" },
      vision_route: { provider: "openai", model: "gpt-5.4-vision" },
    });
  });

  it("trims persisted route models before building the settings payload", () => {
    const view = buildProviderSettingsView(buildSettings());

    const payload = toSettingsPayload({
      ...view,
      providerProfiles: {
        ...view.providerProfiles,
        openai: {
          ...view.providerProfiles.openai,
          chat_model: "  gpt-5.4-mini  ",
          embedding_model: "  text-embedding-3-large  ",
          vision_model: "  gpt-5.4-vision  ",
        },
      },
    });

    expect(payload).toMatchObject({
      response_route: { provider: "openai", model: "gpt-5.4-mini" },
      embedding_route: { provider: "openai", model: "text-embedding-3-large" },
      vision_route: { provider: "openai", model: "gpt-5.4-vision" },
    });
  });

  it("switches the default embedding provider when the primary provider changes", () => {
    const nextView = updatePrimaryProvider(buildProviderSettingsView(buildSettings()), "anthropic");

    expect(nextView.primaryProvider).toBe("anthropic");
    expect(nextView.retrievalProvider).toBe("voyage");
    expect(toSettingsPayload(nextView)).toMatchObject({
      response_route: { provider: "anthropic", model: "claude-sonnet-4-5" },
      embedding_route: { provider: "voyage", model: "voyage-3.5" },
      vision_route: { provider: "anthropic", model: "claude-sonnet-4-5" },
    });
  });
});

describe("model getters", () => {
  it("getPrimaryChatModel returns the chat model of the primary provider", () => {
    const view = buildProviderSettingsView(buildSettings());

    expect(getPrimaryChatModel(view)).toBe("gpt-5.4");
  });

  it("getPrimaryVisionModel returns the vision model of the primary provider", () => {
    const view = buildProviderSettingsView(buildSettings());

    expect(getPrimaryVisionModel(view)).toBe("gpt-5.4");
  });

  it("getDefaultEmbeddingModel returns the default embedding model for openai primary", () => {
    const view = buildProviderSettingsView(buildSettings());

    expect(getDefaultEmbeddingModel(view)).toBe("text-embedding-3-small");
  });

  it("getDefaultEmbeddingModel returns voyage model when primary is anthropic", () => {
    const view = buildProviderSettingsView(
      buildSettings({
        response_route: { provider: "anthropic", model: "claude-sonnet-4-5" },
        vision_route: { provider: "anthropic", model: "claude-sonnet-4-5" },
        provider_profiles: {
          anthropic: {
            api_key: null,
            base_url: "https://api.anthropic.com",
            chat_model: "claude-sonnet-4-5",
            vision_model: "claude-sonnet-4-5",
          },
        } as AppSettings["provider_profiles"],
      }),
    );

    expect(getDefaultEmbeddingModel(view)).toBe("voyage-3.5");
  });

  it("getRetrievalEmbeddingModel returns retrieval-specific model when override is enabled", () => {
    const view = buildProviderSettingsView(
      buildSettings({
        pending_embedding_route: { provider: "voyage", model: "voyage-lite" },
      }),
    );

    expect(getRetrievalEmbeddingModel(view)).toBe("voyage-lite");
  });
});

describe("toggleRetrievalOverride", () => {
  it("enables retrieval override and resets to default provider", () => {
    const view = buildProviderSettingsView(buildSettings());

    const toggled = toggleRetrievalOverride(view);

    expect(toggled.retrievalOverrideEnabled).toBe(true);
    expect(toggled.retrievalProvider).toBe("openai");
  });

  it("disables retrieval override when already enabled", () => {
    const view = buildProviderSettingsView(
      buildSettings({
        pending_embedding_route: { provider: "voyage", model: "voyage-3.5" },
      }),
    );

    expect(view.retrievalOverrideEnabled).toBe(true);

    const toggled = toggleRetrievalOverride(view);

    expect(toggled.retrievalOverrideEnabled).toBe(false);
    expect(toggled.retrievalProvider).toBe("openai");
  });
});
