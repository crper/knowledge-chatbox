/**
 * @file 设置相关接口请求模块。
 */

import { openapiRequestRequired } from "@/lib/api/client";
import { apiFetchClient } from "@/lib/api/generated/client";
import type { components } from "@/lib/api/generated/schema";

export type ResponseProviderName = "openai" | "anthropic" | "ollama";
export type EmbeddingProviderName = "openai" | "voyage" | "ollama";
export type VisionProviderName = "openai" | "anthropic" | "ollama";
export type IndexRebuildStatus = "idle" | "running" | "failed";

export type CapabilityRoute<TProvider extends string> = {
  provider: TProvider;
  model: string;
};

export type ProviderProfiles = {
  openai: {
    api_key?: string | null;
    base_url?: string | null;
    chat_model?: string | null;
    embedding_model?: string | null;
    vision_model?: string | null;
  };
  anthropic: {
    api_key?: string | null;
    base_url?: string | null;
    chat_model?: string | null;
    vision_model?: string | null;
  };
  voyage: {
    api_key?: string | null;
    base_url?: string | null;
    embedding_model?: string | null;
  };
  ollama: {
    api_key?: string | null;
    base_url?: string | null;
    chat_model?: string | null;
    embedding_model?: string | null;
    vision_model?: string | null;
  };
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

function toAppSettings(settings: SettingsRead): AppSettings {
  return {
    id: settings.id,
    provider_profiles: settings.provider_profiles as ProviderProfiles,
    response_route: settings.response_route,
    embedding_route: settings.embedding_route,
    pending_embedding_route: settings.pending_embedding_route ?? null,
    vision_route: settings.vision_route,
    system_prompt: settings.system_prompt ?? null,
    provider_timeout_seconds: settings.provider_timeout_seconds,
    updated_by_user_id: settings.updated_by_user_id ?? null,
    updated_at: settings.updated_at,
    active_index_generation: settings.active_index_generation,
    building_index_generation: settings.building_index_generation ?? null,
    index_rebuild_status: settings.index_rebuild_status as IndexRebuildStatus,
    rebuild_started: settings.rebuild_started,
    reindex_required: settings.reindex_required,
  };
}

function toSettingsPayload(input: Partial<AppSettings>) {
  const payload: Record<string, unknown> = {};
  if ("provider_profiles" in input) {
    payload.provider_profiles = input.provider_profiles;
  }

  if ("response_route" in input) {
    payload.response_route = input.response_route;
  }
  if ("embedding_route" in input) {
    payload.embedding_route = input.embedding_route;
  }
  if ("vision_route" in input) {
    payload.vision_route = input.vision_route;
  }

  if ("system_prompt" in input) {
    payload.system_prompt = input.system_prompt ?? null;
  }
  if ("provider_timeout_seconds" in input) {
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
