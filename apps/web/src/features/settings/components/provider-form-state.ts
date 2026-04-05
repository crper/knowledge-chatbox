import {
  buildFormValidationResult,
  formError,
  trimmedRequired,
  normalizeText,
  type FormErrorDescriptor,
  type FormValidationResult,
} from "@/lib/forms";
import { httpUrlSchema, positiveIntegerInRange } from "@/lib/validation/schemas";
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

type ProfileModelField = "chat_model" | "embedding_model" | "vision_model";

const RESPONSE_MODEL_FIELD: ProfileModelField = "chat_model";
const EMBEDDING_MODEL_FIELD: ProfileModelField = "embedding_model";
const VISION_MODEL_FIELD: ProfileModelField = "vision_model";

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

  const modelSyncEntries: Array<{
    provider: string;
    field: ProfileModelField;
    model: string;
  }> = [
    {
      provider: settings.response_route.provider,
      field: RESPONSE_MODEL_FIELD,
      model: settings.response_route.model,
    },
    {
      provider: effectiveEmbeddingRoute.provider,
      field: EMBEDDING_MODEL_FIELD,
      model: effectiveEmbeddingRoute.model,
    },
    {
      provider: settings.vision_route.provider,
      field: VISION_MODEL_FIELD,
      model: settings.vision_route.model,
    },
  ];

  for (const { provider, field, model } of modelSyncEntries) {
    if (provider in profiles) {
      (profiles[provider as keyof ProviderProfileModels] as Record<string, string | undefined>)[
        field
      ] = normalizeText(model);
    }
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
    providerTimeoutSeconds: validatePositiveInteger(
      view.providerTimeoutSeconds,
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

function validatePositiveInteger(value: number, errorKey: string): FormErrorDescriptor | undefined {
  const result = positiveIntegerInRange(1, 600).safeParse(value);
  if (!result.success) {
    return formError(errorKey);
  }
  return undefined;
}

function validatePrimaryBaseUrl(view: ProviderSettingsView) {
  const baseUrl = view.providerProfiles[view.primaryProvider].base_url;
  if (view.primaryProvider === "ollama" && !normalizeText(baseUrl)) {
    return formError("providerTestOllamaBaseUrlMissing");
  }

  // 使用 Zod schema 验证 URL
  const urlResult = httpUrlSchema({ allowEmpty: view.primaryProvider !== "ollama" }).safeParse(
    baseUrl ?? "",
  );
  if (!urlResult.success) {
    return formError("baseUrlInvalidError");
  }
  return undefined;
}
