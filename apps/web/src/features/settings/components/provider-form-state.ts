import {
  buildFormValidationResult,
  formError,
  isValidHttpUrl,
  positiveIntegerInRange,
  trimmedRequired,
  type FormErrorDescriptor,
  type FormValidationResult,
} from "@/lib/forms";
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
  retrievalOverrideEnabled: boolean;
  retrievalProvider: EmbeddingProviderName;
  templateProvider: TemplateProviderName;
  providerProfiles: ProviderProfiles;
  providerTimeoutSeconds: number;
};

export type ProviderSettingsFieldName =
  | "chatModel"
  | "embeddingModel"
  | "visionModel"
  | "primaryBaseUrl"
  | "retrievalEmbeddingModel"
  | "providerTimeoutSeconds";

export type ProviderSettingsValidationResult = FormValidationResult<ProviderSettingsFieldName> & {
  firstInvalidField: ProviderSettingsFieldName;
};

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
    retrievalOverrideEnabled,
    retrievalProvider: retrievalOverrideEnabled
      ? targetEmbeddingRoute.provider
      : defaultEmbeddingProvider,
    templateProvider: preferredTemplateProvider(primaryProvider),
    providerProfiles,
    providerTimeoutSeconds: settings.provider_timeout_seconds ?? 60,
  };
}

export function getPrimaryChatModel(view: ProviderSettingsView) {
  return getChatModel(view.providerProfiles[view.primaryProvider]);
}

export function getPrimaryVisionModel(view: ProviderSettingsView) {
  return getVisionModel(view.providerProfiles[view.primaryProvider]);
}

export function getDefaultEmbeddingModel(view: ProviderSettingsView) {
  return getEmbeddingModel(
    view.providerProfiles,
    getDefaultEmbeddingProvider(view.primaryProvider),
  );
}

export function getRetrievalEmbeddingModel(view: ProviderSettingsView) {
  return getEmbeddingModel(view.providerProfiles, view.retrievalProvider);
}

export function updatePrimaryProvider(
  current: ProviderSettingsView,
  primaryProvider: PrimaryProviderName,
): ProviderSettingsView {
  const defaultEmbeddingProvider = getDefaultEmbeddingProvider(primaryProvider);
  const templateProvider =
    current.templateProvider === primaryProvider
      ? preferredTemplateProvider(primaryProvider)
      : current.templateProvider;

  return {
    ...current,
    primaryProvider,
    retrievalProvider: current.retrievalOverrideEnabled
      ? current.retrievalProvider
      : defaultEmbeddingProvider,
    templateProvider,
  };
}

export function toggleRetrievalOverride(current: ProviderSettingsView): ProviderSettingsView {
  const defaultProvider = getDefaultEmbeddingProvider(current.primaryProvider);

  return {
    ...current,
    retrievalOverrideEnabled: !current.retrievalOverrideEnabled,
    retrievalProvider: defaultProvider,
  };
}

export function toSettingsPayload(view: ProviderSettingsView) {
  const defaultEmbeddingProvider = getDefaultEmbeddingProvider(view.primaryProvider);
  const chatModel = getPrimaryChatModel(view);
  const defaultEmbeddingModel = getDefaultEmbeddingModel(view);
  const retrievalEmbeddingModel = getRetrievalEmbeddingModel(view);
  const visionModel = getPrimaryVisionModel(view);
  const embeddingRoute = view.retrievalOverrideEnabled
    ? {
        provider: view.retrievalProvider,
        model: retrievalEmbeddingModel.trim(),
      }
    : {
        provider: defaultEmbeddingProvider,
        model: defaultEmbeddingModel.trim(),
      };

  return {
    provider_profiles: view.providerProfiles,
    response_route: {
      provider: view.primaryProvider,
      model: chatModel.trim(),
    },
    embedding_route: embeddingRoute,
    vision_route: {
      provider: view.primaryProvider,
      model: visionModel.trim(),
    },
    provider_timeout_seconds: view.providerTimeoutSeconds,
  } satisfies Partial<AppSettings>;
}

export function validateProviderSettingsView(
  view: ProviderSettingsView,
): ProviderSettingsValidationResult | undefined {
  const chatModel = getPrimaryChatModel(view);
  const defaultEmbeddingModel = getDefaultEmbeddingModel(view);
  const retrievalEmbeddingModel = getRetrievalEmbeddingModel(view);
  const visionModel = getPrimaryVisionModel(view);
  const fields: Partial<Record<ProviderSettingsFieldName, FormErrorDescriptor | undefined>> = {
    chatModel: trimmedRequired(chatModel, "chatModelRequiredError"),
    embeddingModel: trimmedRequired(defaultEmbeddingModel, "embeddingModelRequiredError"),
    primaryBaseUrl: validatePrimaryBaseUrl(view),
    providerTimeoutSeconds: positiveIntegerInRange(
      view.providerTimeoutSeconds,
      1,
      600,
      "providerTimeoutInvalidError",
    ),
    retrievalEmbeddingModel: view.retrievalOverrideEnabled
      ? trimmedRequired(retrievalEmbeddingModel, "retrievalEmbeddingModelRequiredError")
      : undefined,
    visionModel: trimmedRequired(visionModel, "visionModelRequiredError"),
  };

  const result = buildFormValidationResult(formError("providerValidationSummaryError"), fields);

  if (!result) {
    return undefined;
  }

  return {
    ...result,
    firstInvalidField: getFirstInvalidField(fields),
  };
}

function getFirstInvalidField(
  fields: Partial<Record<ProviderSettingsFieldName, FormErrorDescriptor | undefined>>,
): ProviderSettingsFieldName {
  const order: ProviderSettingsFieldName[] = [
    "chatModel",
    "embeddingModel",
    "visionModel",
    "primaryBaseUrl",
    "retrievalEmbeddingModel",
    "providerTimeoutSeconds",
  ];

  return order.find((field) => fields[field] !== undefined) ?? "chatModel";
}

function validatePrimaryBaseUrl(view: ProviderSettingsView) {
  const baseUrl = view.providerProfiles[view.primaryProvider].base_url;
  if (view.primaryProvider === "ollama" && !normalizeText(baseUrl)) {
    return formError("providerTestOllamaBaseUrlMissing");
  }

  return isValidHttpUrl(baseUrl, "baseUrlInvalidError", {
    allowEmpty: view.primaryProvider !== "ollama",
  });
}
