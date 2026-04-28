import {
  loginSchema,
  createUserSchema,
  changePasswordSchema,
  resetPasswordSchema,
  systemPromptSchema,
  providerSettingsSchema,
} from "@/lib/validation/schemas";

function buildProviderSettings(overrides: Record<string, unknown> = {}) {
  return {
    primaryProvider: "openai",
    retrievalOverrideEnabled: false,
    retrievalProvider: "openai",
    templateProvider: "ollama",
    providerProfiles: {
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
        api_key: "test-key",
        base_url: "https://api.openai.com/v1",
        chat_model: "gpt-4",
        embedding_model: "text-embedding-3-small",
        vision_model: "gpt-4",
      },
      voyage: {
        api_key: null,
        base_url: "https://api.voyageai.com/v1",
        embedding_model: "voyage-3.5",
      },
    },
    providerTimeoutSeconds: 60,
    ...overrides,
  };
}

describe("loginSchema", () => {
  it("rejects empty username", () => {
    const result = loginSchema.safeParse({ username: "  ", password: "pass" });
    expect(result.success).toBe(false);
    if (!result.success) {
      const paths = result.error.issues.map((i) => i.path.join("."));
      expect(paths).toContain("username");
    }
  });

  it("rejects empty password", () => {
    const result = loginSchema.safeParse({ username: "user", password: "" });
    expect(result.success).toBe(false);
    if (!result.success) {
      const paths = result.error.issues.map((i) => i.path.join("."));
      expect(paths).toContain("password");
    }
  });

  it("accepts valid input", () => {
    const result = loginSchema.safeParse({ username: "admin", password: "secret" });
    expect(result.success).toBe(true);
  });
});

describe("createUserSchema", () => {
  it("rejects short password", () => {
    const result = createUserSchema.safeParse({
      username: "user",
      password: "1234567",
      role: "user",
    });
    expect(result.success).toBe(false);
  });

  it("accepts valid input", () => {
    const result = createUserSchema.safeParse({
      username: "user",
      password: "12345678",
      role: "user",
    });
    expect(result.success).toBe(true);
  });
});

describe("changePasswordSchema", () => {
  it("rejects empty current password", () => {
    const result = changePasswordSchema.safeParse({ currentPassword: "", newPassword: "12345678" });
    expect(result.success).toBe(false);
  });

  it("rejects short new password", () => {
    const result = changePasswordSchema.safeParse({ currentPassword: "old", newPassword: "short" });
    expect(result.success).toBe(false);
  });

  it("accepts valid input", () => {
    const result = changePasswordSchema.safeParse({
      currentPassword: "old-pass",
      newPassword: "12345678",
    });
    expect(result.success).toBe(true);
  });
});

describe("resetPasswordSchema", () => {
  it("rejects short password", () => {
    const result = resetPasswordSchema.safeParse({ newPassword: "short" });
    expect(result.success).toBe(false);
  });

  it("accepts valid input", () => {
    const result = resetPasswordSchema.safeParse({ newPassword: "12345678" });
    expect(result.success).toBe(true);
  });
});

describe("systemPromptSchema", () => {
  it("accepts any string", () => {
    const result = systemPromptSchema.safeParse({ system_prompt: "You are helpful." });
    expect(result.success).toBe(true);
  });

  it("accepts empty string", () => {
    const result = systemPromptSchema.safeParse({ system_prompt: "" });
    expect(result.success).toBe(true);
  });
});

describe("providerSettingsSchema", () => {
  it("rejects invalid timeout values", () => {
    const result = providerSettingsSchema.safeParse(
      buildProviderSettings({ providerTimeoutSeconds: 601 }),
    );
    expect(result.success).toBe(false);
    if (!result.success) {
      const paths = result.error.issues.map((i) => i.path.join("."));
      expect(paths.some((p) => p.includes("providerTimeoutSeconds"))).toBe(true);
    }
  });

  it("rejects missing chat_model for primary provider", () => {
    const result = providerSettingsSchema.safeParse(
      buildProviderSettings({
        providerProfiles: {
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
            api_key: "test-key",
            base_url: "https://api.openai.com/v1",
            chat_model: "   ",
            embedding_model: "text-embedding-3-small",
            vision_model: "gpt-4",
          },
          voyage: {
            api_key: null,
            base_url: "https://api.voyageai.com/v1",
            embedding_model: "voyage-3.5",
          },
        },
      }),
    );
    expect(result.success).toBe(false);
  });

  it("accepts valid provider settings", () => {
    const result = providerSettingsSchema.safeParse(buildProviderSettings());
    expect(result.success).toBe(true);
  });
});
