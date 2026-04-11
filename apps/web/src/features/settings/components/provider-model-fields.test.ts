import type { ProviderProfiles } from "../api/settings";
import { getProviderProfileModel, setProviderProfileModel } from "./provider-model-fields";

function buildProviderProfiles(): ProviderProfiles {
  return {
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
  };
}

describe("provider-model-fields", () => {
  it("reads supported provider model fields through one typed helper", () => {
    const profiles = buildProviderProfiles();

    expect(getProviderProfileModel(profiles, "openai", "chat_model")).toBe("gpt-5.4");
    expect(getProviderProfileModel(profiles, "anthropic", "vision_model")).toBe(
      "claude-sonnet-4-5",
    );
    expect(getProviderProfileModel(profiles, "voyage", "embedding_model")).toBe("voyage-3.5");
  });

  it("writes only the targeted provider model field", () => {
    const profiles = buildProviderProfiles();

    const nextProfiles = setProviderProfileModel(profiles, "ollama", "embedding_model", "bge-m3");

    expect(getProviderProfileModel(nextProfiles, "ollama", "embedding_model")).toBe("bge-m3");
    expect(getProviderProfileModel(nextProfiles, "ollama", "chat_model")).toBe("qwen3.5:4b");
    expect(getProviderProfileModel(nextProfiles, "openai", "embedding_model")).toBe(
      "text-embedding-3-small",
    );
  });
});
