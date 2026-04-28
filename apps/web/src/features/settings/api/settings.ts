/**
 * @file 设置相关接口请求模块。
 */

import { openapiRequestRequired } from "@/lib/api/client";
import { apiFetchClient } from "@/lib/api/generated/client";
import type { components } from "@/lib/api/generated/schema";

export type ResponseProviderName = components["schemas"]["ResponseProvider"];
export type EmbeddingProviderName = components["schemas"]["EmbeddingProvider"];
export type VisionProviderName = components["schemas"]["VisionProvider"];
export type IndexRebuildStatus = components["schemas"]["IndexRebuildStatus"];

type CapabilityRoute<TProvider extends string> = {
  provider: TProvider;
  model: string;
};

type SchemaProviderProfiles = components["schemas"]["ProviderProfiles"];

export type ProviderProfileKeys = keyof SchemaProviderProfiles;

type ProviderProfileDefaults = {
  [K in ProviderProfileKeys]: NonNullable<SchemaProviderProfiles[K]>;
};

const PROVIDER_PROFILE_DEFAULTS: ProviderProfileDefaults = {
  anthropic: { api_key: null, base_url: null, chat_model: null, vision_model: null },
  ollama: { base_url: null, chat_model: null, embedding_model: null, vision_model: null },
  openai: {
    api_key: null,
    base_url: null,
    chat_model: null,
    embedding_model: null,
    vision_model: null,
  },
  voyage: { api_key: null, base_url: null, embedding_model: null },
};

export type ProviderProfiles = {
  [K in ProviderProfileKeys]: NonNullable<SchemaProviderProfiles[K]>;
};

export type AppSettings = {
  id?: number;
  provider_profiles: ProviderProfiles;
  response_route: CapabilityRoute<ResponseProviderName>;
  embedding_route: CapabilityRoute<EmbeddingProviderName>;
  pending_embedding_route?: CapabilityRoute<EmbeddingProviderName> | null;
  vision_route: CapabilityRoute<VisionProviderName>;
  system_prompt?: string | null;
  provider_timeout_seconds?: number;
  updated_by_user_id?: number | null;
  updated_at?: string;
  active_index_generation?: number;
  building_index_generation?: number | null;
  index_rebuild_status?: IndexRebuildStatus;
  rebuild_started?: boolean;
  reindex_required?: boolean;
};

export type CapabilityHealthResult = {
  code?: string | null;
  provider: string;
  model: string;
  healthy: boolean;
  message: string;
  latency_ms?: number | null;
};

export type ProviderConnectionResult = {
  response: CapabilityHealthResult;
  embedding: CapabilityHealthResult;
  vision: CapabilityHealthResult;
};

type SettingsRead = components["schemas"]["SettingsRead"];
type RouteLike = { provider: string; model: string };

function narrowCapabilityRoute<TProvider extends string>(
  route: RouteLike,
  allowedProviders: readonly TProvider[],
): CapabilityRoute<TProvider> {
  if (!allowedProviders.includes(route.provider as TProvider)) {
    throw new Error(`Unsupported provider ${route.provider}`);
  }
  return {
    provider: route.provider as TProvider,
    model: route.model,
  };
}

const RESPONSE_PROVIDERS = ["openai", "anthropic", "ollama"] as const;
const EMBEDDING_PROVIDERS = ["openai", "voyage", "ollama"] as const;
const VISION_PROVIDERS = ["openai", "anthropic", "ollama"] as const;

function fillProviderProfiles(profiles: SchemaProviderProfiles): ProviderProfiles {
  return {
    anthropic: { ...PROVIDER_PROFILE_DEFAULTS.anthropic, ...profiles.anthropic },
    ollama: { ...PROVIDER_PROFILE_DEFAULTS.ollama, ...profiles.ollama },
    openai: { ...PROVIDER_PROFILE_DEFAULTS.openai, ...profiles.openai },
    voyage: { ...PROVIDER_PROFILE_DEFAULTS.voyage, ...profiles.voyage },
  };
}

function toAppSettings(settings: SettingsRead): AppSettings {
  return {
    id: settings.id,
    provider_profiles: fillProviderProfiles(settings.provider_profiles),
    response_route: narrowCapabilityRoute(settings.response_route, RESPONSE_PROVIDERS),
    embedding_route: narrowCapabilityRoute(settings.embedding_route, EMBEDDING_PROVIDERS),
    pending_embedding_route: settings.pending_embedding_route
      ? narrowCapabilityRoute(settings.pending_embedding_route, EMBEDDING_PROVIDERS)
      : null,
    vision_route: narrowCapabilityRoute(settings.vision_route, VISION_PROVIDERS),
    system_prompt: settings.system_prompt ?? null,
    provider_timeout_seconds: settings.provider_timeout_seconds,
    updated_by_user_id: settings.updated_by_user_id ?? null,
    updated_at: settings.updated_at,
    active_index_generation: settings.active_index_generation,
    building_index_generation: settings.building_index_generation ?? null,
    index_rebuild_status: settings.index_rebuild_status,
    rebuild_started: settings.rebuild_started,
    reindex_required: settings.reindex_required,
  };
}

function toSettingsPayload(input: Partial<AppSettings>) {
  const payload: Record<string, unknown> = {};
  if (input.provider_profiles !== undefined) {
    payload.provider_profiles = input.provider_profiles;
  }

  if (input.response_route !== undefined) {
    payload.response_route = input.response_route;
  }
  if (input.embedding_route !== undefined) {
    payload.embedding_route = input.embedding_route;
  }
  if (input.vision_route !== undefined) {
    payload.vision_route = input.vision_route;
  }

  if (input.system_prompt !== undefined) {
    payload.system_prompt = input.system_prompt ?? null;
  }
  if (input.provider_timeout_seconds !== undefined) {
    payload.provider_timeout_seconds = input.provider_timeout_seconds ?? null;
  }
  return payload;
}

export async function getSettings() {
  const settings = await openapiRequestRequired<SettingsRead>(apiFetchClient.GET("/api/settings"));
  return toAppSettings(settings);
}

export async function updateSettings(input: Partial<AppSettings>) {
  const settings = await openapiRequestRequired<SettingsRead>(
    apiFetchClient.PUT("/api/settings", {
      body: toSettingsPayload(input),
    }),
  );
  return toAppSettings(settings);
}

export function testProviderConnection(input: Partial<AppSettings>) {
  return openapiRequestRequired<ProviderConnectionResult>(
    apiFetchClient.POST("/api/settings/test-routes", {
      body: toSettingsPayload(input),
    }),
  );
}
