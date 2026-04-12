import { defaultEmbeddingProviderByPrimary } from "@/lib/validation/schemas";
import type {
  AppSettings,
  EmbeddingProviderName,
  ProviderProfiles,
  ResponseProviderName,
} from "../api/settings";
import { getProviderProfileModel } from "./provider-model-fields";

export type PrimaryProviderName = ResponseProviderName;
export type TemplateProviderName = keyof ProviderProfiles;

export type ProviderProfileModels = ProviderProfiles;

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

export const PRIMARY_PROVIDER_OPTIONS: PrimaryProviderName[] = ["ollama", "openai", "anthropic"];
export const TEMPLATE_PROVIDER_OPTIONS: TemplateProviderName[] = [
  "ollama",
  "openai",
  "anthropic",
  "voyage",
];

function preferredTemplateProvider(primaryProvider: PrimaryProviderName): TemplateProviderName {
  return TEMPLATE_PROVIDER_OPTIONS.find((provider) => provider !== primaryProvider) ?? "openai";
}

export function getDefaultEmbeddingProvider(
  primaryProvider: PrimaryProviderName,
): EmbeddingProviderName {
  return defaultEmbeddingProviderByPrimary[primaryProvider];
}

export function buildProviderSettingsView(settings: AppSettings): ProviderSettingsView {
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
    providerProfiles: settings.provider_profiles,
    providerTimeoutSeconds: settings.provider_timeout_seconds ?? 60,
  };
}

export function getPrimaryChatModel(view: ProviderSettingsView) {
  return getProviderProfileModel(view.providerProfiles, view.primaryProvider, "chat_model");
}

export function getPrimaryVisionModel(view: ProviderSettingsView) {
  return getProviderProfileModel(view.providerProfiles, view.primaryProvider, "vision_model");
}

export function getDefaultEmbeddingModel(view: ProviderSettingsView) {
  return getProviderProfileModel(
    view.providerProfiles,
    getDefaultEmbeddingProvider(view.primaryProvider),
    "embedding_model",
  );
}

export function getRetrievalEmbeddingModel(view: ProviderSettingsView) {
  return getProviderProfileModel(view.providerProfiles, view.retrievalProvider, "embedding_model");
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
        model: retrievalEmbeddingModel,
      }
    : {
        provider: defaultEmbeddingProvider,
        model: defaultEmbeddingModel,
      };

  return {
    provider_profiles: view.providerProfiles,
    response_route: {
      provider: view.primaryProvider,
      model: chatModel,
    },
    embedding_route: embeddingRoute,
    vision_route: {
      provider: view.primaryProvider,
      model: visionModel,
    },
    provider_timeout_seconds: view.providerTimeoutSeconds,
  } satisfies Partial<AppSettings>;
}
