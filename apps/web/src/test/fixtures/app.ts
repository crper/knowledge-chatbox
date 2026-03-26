/**
 * @file 测试共享 fixture。
 */

import type { AppSettings, ProviderConnectionResult } from "@/features/settings/api/settings";
import type { AppUser } from "@/lib/api/client";

type ProviderProfilesOverrides = {
  openai?: Partial<AppSettings["provider_profiles"]["openai"]>;
  anthropic?: Partial<AppSettings["provider_profiles"]["anthropic"]>;
  voyage?: Partial<AppSettings["provider_profiles"]["voyage"]>;
  ollama?: Partial<AppSettings["provider_profiles"]["ollama"]>;
};

type AppSettingsOverrides = Omit<
  Partial<AppSettings>,
  "provider_profiles" | "response_route" | "embedding_route" | "vision_route"
> & {
  provider_profiles?: ProviderProfilesOverrides;
  response_route?: Partial<AppSettings["response_route"]>;
  embedding_route?: Partial<AppSettings["embedding_route"]>;
  vision_route?: Partial<AppSettings["vision_route"]>;
};

export const DEFAULT_SYSTEM_PROMPT = [
  "你是 Knowledge Chatbox 的 AI 助手。",
  "请基于用户提供的问题、会话历史和检索到的资源内容，给出准确、简洁、可执行的回答。",
  "优先引用资源事实，不要编造未在上下文中出现的信息。",
  "永远回复中文。",
].join("\n");

export function buildAppUser(
  role: AppUser["role"] = "admin",
  overrides: Partial<AppUser> = {},
): AppUser {
  const base: AppUser = {
    id: 1,
    username: role,
    role,
    status: "active",
    theme_preference: "system",
  };

  return {
    ...base,
    ...overrides,
  };
}

export function buildAppSettings(overrides: AppSettingsOverrides = {}): AppSettings {
  const base: AppSettings = {
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
    pending_embedding_route: null,
    vision_route: { provider: "openai", model: "gpt-5.4" },
    system_prompt: DEFAULT_SYSTEM_PROMPT,
    provider_timeout_seconds: 60,
    updated_by_user_id: 1,
    updated_at: "2026-03-21T00:00:00Z",
    active_index_generation: 3,
    building_index_generation: null,
    index_rebuild_status: "idle",
    rebuild_started: false,
    reindex_required: false,
  };

  return {
    ...base,
    ...overrides,
    provider_profiles: {
      ...base.provider_profiles,
      ...overrides.provider_profiles,
      openai: {
        ...base.provider_profiles.openai,
        ...overrides.provider_profiles?.openai,
      },
      anthropic: {
        ...base.provider_profiles.anthropic,
        ...overrides.provider_profiles?.anthropic,
      },
      voyage: {
        ...base.provider_profiles.voyage,
        ...overrides.provider_profiles?.voyage,
      },
      ollama: {
        ...base.provider_profiles.ollama,
        ...overrides.provider_profiles?.ollama,
      },
    },
    response_route: {
      ...base.response_route,
      ...overrides.response_route,
    },
    embedding_route: {
      ...base.embedding_route,
      ...overrides.embedding_route,
    },
    pending_embedding_route:
      overrides.pending_embedding_route === undefined
        ? base.pending_embedding_route
        : overrides.pending_embedding_route,
    vision_route: {
      ...base.vision_route,
      ...overrides.vision_route,
    },
  };
}

type ProviderConnectionResultOverrides = {
  response?: Partial<ProviderConnectionResult["response"]>;
  embedding?: Partial<ProviderConnectionResult["embedding"]>;
  vision?: Partial<ProviderConnectionResult["vision"]>;
};

export function buildProviderConnectionResult(
  overrides: ProviderConnectionResultOverrides = {},
): ProviderConnectionResult {
  const base: ProviderConnectionResult = {
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
  };

  return {
    ...base,
    ...overrides,
    response: {
      ...base.response,
      ...overrides.response,
    },
    embedding: {
      ...base.embedding,
      ...overrides.embedding,
    },
    vision: {
      ...base.vision,
      ...overrides.vision,
    },
  };
}
