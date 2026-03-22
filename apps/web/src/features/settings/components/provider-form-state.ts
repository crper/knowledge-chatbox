import type {
  AppSettings,
  EmbeddingProviderName,
  ProviderProfiles,
  ResponseProviderName,
} from "../api/settings";

export type PrimaryProviderName = ResponseProviderName;
export type TemplateProviderName = keyof ProviderProfiles;

export type ProviderSettingsView = {
  primaryProvider: PrimaryProviderName;
  chatModel: string;
  embeddingModel: string;
  retrievalOverrideEnabled: boolean;
  retrievalProvider: EmbeddingProviderName;
  retrievalEmbeddingModel: string;
  templateProvider: TemplateProviderName;
  providerProfiles: ProviderProfiles;
  providerTimeoutSeconds: number;
  visionModel: string;
};

export type ProviderSettingsValidationKey =
  | "chatModelRequiredError"
  | "embeddingModelRequiredError"
  | "retrievalEmbeddingModelRequiredError"
  | "visionModelRequiredError"
  | "providerTimeoutInvalidError";

export const PRIMARY_PROVIDER_OPTIONS: PrimaryProviderName[] = ["ollama", "openai", "anthropic"];
export const TEMPLATE_PROVIDER_OPTIONS: TemplateProviderName[] = [
  "ollama",
  "openai",
  "anthropic",
  "voyage",
];

const DEFAULT_EMBEDDING_PROVIDER_BY_PRIMARY: Record<PrimaryProviderName, EmbeddingProviderName> = {
  openai: "openai",
  anthropic: "voyage",
  ollama: "ollama",
};

type OpenAIProfile = ProviderProfiles["openai"] & {
  chat_model?: string | null;
  embedding_model?: string | null;
  vision_model?: string | null;
};

type AnthropicProfile = ProviderProfiles["anthropic"] & {
  chat_model?: string | null;
  vision_model?: string | null;
};

type VoyageProfile = ProviderProfiles["voyage"] & {
  embedding_model?: string | null;
};

type OllamaProfile = ProviderProfiles["ollama"] & {
  chat_model?: string | null;
  embedding_model?: string | null;
  vision_model?: string | null;
};

export type ProviderProfileModels = {
  anthropic: AnthropicProfile;
  ollama: OllamaProfile;
  openai: OpenAIProfile;
  voyage: VoyageProfile;
};

function normalizeText(value: string | null | undefined) {
  return typeof value === "string" ? value : "";
}

function cloneProfiles(profiles: ProviderProfiles): ProviderProfileModels {
  return {
    openai: { ...profiles.openai },
    anthropic: { ...profiles.anthropic },
    voyage: { ...profiles.voyage },
    ollama: { ...profiles.ollama },
  };
}

function preferredTemplateProvider(primaryProvider: PrimaryProviderName): TemplateProviderName {
  return TEMPLATE_PROVIDER_OPTIONS.find((provider) => provider !== primaryProvider) ?? "openai";
}

export function getDefaultEmbeddingProvider(
  primaryProvider: PrimaryProviderName,
): EmbeddingProviderName {
  return DEFAULT_EMBEDDING_PROVIDER_BY_PRIMARY[primaryProvider];
}

function syncRouteModelsIntoProfiles(settings: AppSettings): ProviderProfileModels {
  const profiles = cloneProfiles(settings.provider_profiles);
  const effectiveEmbeddingRoute = settings.pending_embedding_route ?? settings.embedding_route;

  if (settings.response_route.provider === "openai") {
    profiles.openai.chat_model = normalizeText(settings.response_route.model);
  }
  if (settings.response_route.provider === "anthropic") {
    profiles.anthropic.chat_model = normalizeText(settings.response_route.model);
  }
  if (settings.response_route.provider === "ollama") {
    profiles.ollama.chat_model = normalizeText(settings.response_route.model);
  }

  if (effectiveEmbeddingRoute.provider === "openai") {
    profiles.openai.embedding_model = normalizeText(effectiveEmbeddingRoute.model);
  }
  if (effectiveEmbeddingRoute.provider === "voyage") {
    profiles.voyage.embedding_model = normalizeText(effectiveEmbeddingRoute.model);
  }
  if (effectiveEmbeddingRoute.provider === "ollama") {
    profiles.ollama.embedding_model = normalizeText(effectiveEmbeddingRoute.model);
  }

  if (settings.vision_route.provider === "openai") {
    profiles.openai.vision_model = normalizeText(settings.vision_route.model);
  }
  if (settings.vision_route.provider === "anthropic") {
    profiles.anthropic.vision_model = normalizeText(settings.vision_route.model);
  }
  if (settings.vision_route.provider === "ollama") {
    profiles.ollama.vision_model = normalizeText(settings.vision_route.model);
  }

  return profiles;
}

function getChatModel(profile: ProviderProfileModels[PrimaryProviderName]) {
  return normalizeText(profile.chat_model);
}

function getVisionModel(profile: ProviderProfileModels[PrimaryProviderName]) {
  return normalizeText(profile.vision_model);
}

function getEmbeddingModel(
  profiles: ProviderProfileModels,
  provider: EmbeddingProviderName,
): string {
  if (provider === "voyage") {
    return normalizeText(profiles.voyage.embedding_model);
  }
  if (provider === "ollama") {
    return normalizeText(profiles.ollama.embedding_model);
  }
  return normalizeText(profiles.openai.embedding_model);
}

export function buildProviderSettingsView(settings: AppSettings): ProviderSettingsView {
  const providerProfiles = syncRouteModelsIntoProfiles(settings);
  const primaryProvider = settings.response_route.provider;
  const defaultEmbeddingProvider = getDefaultEmbeddingProvider(primaryProvider);
  const targetEmbeddingRoute = settings.pending_embedding_route ?? settings.embedding_route;
  const retrievalOverrideEnabled = targetEmbeddingRoute.provider !== defaultEmbeddingProvider;

  return {
    primaryProvider,
    chatModel: getChatModel(providerProfiles[primaryProvider]),
    embeddingModel: getEmbeddingModel(providerProfiles, defaultEmbeddingProvider),
    retrievalOverrideEnabled,
    retrievalProvider: retrievalOverrideEnabled
      ? targetEmbeddingRoute.provider
      : defaultEmbeddingProvider,
    retrievalEmbeddingModel: retrievalOverrideEnabled
      ? normalizeText(targetEmbeddingRoute.model)
      : getEmbeddingModel(providerProfiles, defaultEmbeddingProvider),
    templateProvider: preferredTemplateProvider(primaryProvider),
    providerProfiles,
    providerTimeoutSeconds: settings.provider_timeout_seconds ?? 60,
    visionModel: getVisionModel(providerProfiles[primaryProvider]),
  };
}

export function updatePrimaryProvider(
  current: ProviderSettingsView,
  primaryProvider: PrimaryProviderName,
): ProviderSettingsView {
  const defaultEmbeddingProvider = getDefaultEmbeddingProvider(primaryProvider);
  const chatModel = getChatModel(current.providerProfiles[primaryProvider]);
  const embeddingModel = getEmbeddingModel(current.providerProfiles, defaultEmbeddingProvider);
  const visionModel = getVisionModel(current.providerProfiles[primaryProvider]);
  const templateProvider =
    current.templateProvider === primaryProvider
      ? preferredTemplateProvider(primaryProvider)
      : current.templateProvider;

  return {
    ...current,
    primaryProvider,
    chatModel,
    embeddingModel,
    retrievalProvider: current.retrievalOverrideEnabled
      ? current.retrievalProvider
      : defaultEmbeddingProvider,
    retrievalEmbeddingModel: current.retrievalOverrideEnabled
      ? current.retrievalEmbeddingModel
      : embeddingModel,
    templateProvider,
    visionModel,
  };
}

export function toggleRetrievalOverride(current: ProviderSettingsView): ProviderSettingsView {
  const defaultProvider = getDefaultEmbeddingProvider(current.primaryProvider);

  return {
    ...current,
    retrievalOverrideEnabled: !current.retrievalOverrideEnabled,
    retrievalProvider: defaultProvider,
    retrievalEmbeddingModel: current.embeddingModel,
  };
}

export function toSettingsPayload(view: ProviderSettingsView) {
  const defaultEmbeddingProvider = getDefaultEmbeddingProvider(view.primaryProvider);
  const embeddingRoute = view.retrievalOverrideEnabled
    ? {
        provider: view.retrievalProvider,
        model: view.retrievalEmbeddingModel.trim(),
      }
    : {
        provider: defaultEmbeddingProvider,
        model: view.embeddingModel.trim(),
      };

  return {
    provider_profiles: view.providerProfiles,
    response_route: {
      provider: view.primaryProvider,
      model: view.chatModel.trim(),
    },
    embedding_route: embeddingRoute,
    vision_route: {
      provider: view.primaryProvider,
      model: view.visionModel.trim(),
    },
    provider_timeout_seconds: view.providerTimeoutSeconds,
  } satisfies Partial<AppSettings>;
}

export function validateProviderSettingsView(
  view: ProviderSettingsView,
): ProviderSettingsValidationKey | null {
  if (!view.chatModel.trim()) {
    return "chatModelRequiredError";
  }

  if (!view.embeddingModel.trim()) {
    return "embeddingModelRequiredError";
  }

  if (view.retrievalOverrideEnabled && !view.retrievalEmbeddingModel.trim()) {
    return "retrievalEmbeddingModelRequiredError";
  }

  if (!view.visionModel.trim()) {
    return "visionModelRequiredError";
  }

  if (!Number.isInteger(view.providerTimeoutSeconds) || view.providerTimeoutSeconds <= 0) {
    return "providerTimeoutInvalidError";
  }

  return null;
}
