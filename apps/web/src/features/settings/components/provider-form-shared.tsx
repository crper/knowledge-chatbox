/**
 * @file Provider 表单共享辅助模块。
 */

import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { fieldError } from "@/lib/forms";
import { formatProviderProfile } from "@/lib/provider-display";
import type { AppSettings, CapabilityHealthResult } from "../api/settings";
import {
  TEMPLATE_PROVIDER_OPTIONS,
  type PrimaryProviderName,
  type ProviderProfileModels,
  type ProviderSettingsView,
  type TemplateProviderName,
} from "./provider-form-state";

type ProfileFieldDefinition = {
  hint?: string;
  key: "api_key" | "base_url" | "chat_model" | "embedding_model" | "vision_model";
  labelKey: string;
  type?: "password" | "text";
};

export const providerFormControlClassName =
  "h-11 rounded-xl border-border/80 bg-background/80 md:h-10";
export const providerFormInsetSectionClassName =
  "rounded-xl border border-border/60 bg-background/58 p-4";

const FORM_LABEL_KEY_MAP: Record<ProfileFieldDefinition["key"], string> = {
  api_key: "formApiKeyLabel",
  base_url: "formBaseUrlLabel",
  chat_model: "formChatModelLabel",
  embedding_model: "formEmbeddingModelLabel",
  vision_model: "formVisionModelLabel",
};

export const PROVIDER_DISPLAY_NAMES: Record<TemplateProviderName, string> = {
  openai: "OpenAI",
  anthropic: "Anthropic",
  voyage: "Voyage",
  ollama: "Ollama",
};

export const PROFILE_FIELDS: Record<TemplateProviderName, ProfileFieldDefinition[]> = {
  openai: [
    { key: "api_key", labelKey: FORM_LABEL_KEY_MAP.api_key, type: "password" },
    { hint: "openAiBaseUrlHint", key: "base_url", labelKey: FORM_LABEL_KEY_MAP.base_url },
    { key: "chat_model", labelKey: FORM_LABEL_KEY_MAP.chat_model },
    { key: "embedding_model", labelKey: FORM_LABEL_KEY_MAP.embedding_model },
    { key: "vision_model", labelKey: FORM_LABEL_KEY_MAP.vision_model },
  ],
  anthropic: [
    { key: "api_key", labelKey: FORM_LABEL_KEY_MAP.api_key, type: "password" },
    { hint: "claudeBaseUrlHint", key: "base_url", labelKey: FORM_LABEL_KEY_MAP.base_url },
    { key: "chat_model", labelKey: FORM_LABEL_KEY_MAP.chat_model },
    { key: "vision_model", labelKey: FORM_LABEL_KEY_MAP.vision_model },
  ],
  voyage: [
    { key: "api_key", labelKey: FORM_LABEL_KEY_MAP.api_key, type: "password" },
    { hint: "voyageBaseUrlHint", key: "base_url", labelKey: FORM_LABEL_KEY_MAP.base_url },
    {
      hint: "voyageEmbeddingHint",
      key: "embedding_model",
      labelKey: FORM_LABEL_KEY_MAP.embedding_model,
    },
  ],
  ollama: [
    { hint: "ollamaBaseUrlHint", key: "base_url", labelKey: FORM_LABEL_KEY_MAP.base_url },
    { key: "chat_model", labelKey: FORM_LABEL_KEY_MAP.chat_model },
    { key: "embedding_model", labelKey: FORM_LABEL_KEY_MAP.embedding_model },
    { key: "vision_model", labelKey: FORM_LABEL_KEY_MAP.vision_model },
  ],
};

export function getProfileFieldValue(
  profile: ProviderProfileModels[TemplateProviderName],
  key: ProfileFieldDefinition["key"],
) {
  return (profile as Record<string, string | null | undefined>)[key] ?? "";
}

export function getNonPrimaryTemplateOptions(
  primaryProvider: PrimaryProviderName,
): TemplateProviderName[] {
  return TEMPLATE_PROVIDER_OPTIONS.filter((provider) => provider !== primaryProvider);
}

export function updateTemplateProfileField(
  current: ProviderSettingsView,
  provider: TemplateProviderName,
  key: ProfileFieldDefinition["key"],
  value: string,
): ProviderSettingsView {
  const nextProfiles = {
    ...current.providerProfiles,
    [provider]: {
      ...current.providerProfiles[provider],
      [key]: value,
    },
  } as ProviderProfileModels;

  return {
    ...current,
    providerProfiles: nextProfiles,
  };
}

export function updatePrimaryProfileField(
  current: ProviderSettingsView,
  key: ProfileFieldDefinition["key"],
  value: string,
): ProviderSettingsView {
  return updateTemplateProfileField(current, current.primaryProvider, key, value);
}

export function renderProfileFields({
  includeModelFields,
  inputRef,
  manualFieldErrors,
  onChange,
  profile,
  provider,
  t,
}: {
  includeModelFields: boolean;
  inputRef?: (key: ProfileFieldDefinition["key"], node: HTMLElement | null) => void;
  manualFieldErrors?: Partial<Record<ProfileFieldDefinition["key"], string>>;
  onChange: (key: ProfileFieldDefinition["key"], value: string) => void;
  profile: ProviderProfileModels[TemplateProviderName];
  provider: TemplateProviderName;
  t: (key: string, params?: Record<string, unknown>) => string;
}) {
  const visibleFields = PROFILE_FIELDS[provider].filter(
    (field) => includeModelFields || !field.key.endsWith("_model"),
  );

  return (
    <FieldGroup className="grid gap-5 md:grid-cols-2">
      {visibleFields.map((field) => {
        const label = t(field.labelKey, { provider: PROVIDER_DISPLAY_NAMES[provider] });
        return (
          <Field key={`${provider}-${field.key}`}>
            <FieldLabel>{label}</FieldLabel>
            <Input
              aria-label={label}
              aria-invalid={Boolean(manualFieldErrors?.[field.key])}
              className={providerFormControlClassName}
              onChange={(event) => onChange(field.key, event.target.value)}
              ref={(node) => inputRef?.(field.key, node)}
              type={field.type ?? "text"}
              value={getProfileFieldValue(profile, field.key)}
            />
            {field.hint ? <FieldDescription>{t(field.hint)}</FieldDescription> : null}
            <FieldError errors={fieldError(manualFieldErrors?.[field.key])} />
          </Field>
        );
      })}
    </FieldGroup>
  );
}

export function getCapabilityHealthMessage(
  result: CapabilityHealthResult,
  t: (key: string, params?: Record<string, unknown>) => string,
  ollamaBaseUrl?: string | null,
) {
  if (result.code === "openai_model_not_available") {
    return t("providerTestOpenAiModelNotAvailable", { model: result.model });
  }

  if (result.code === "openai_invalid_api_key") {
    return t("providerTestOpenAiInvalidApiKey");
  }

  if (result.code === "ollama_base_url_unreachable") {
    return t("providerTestOllamaBaseUrlUnreachable", {
      baseUrl: ollamaBaseUrl || "http://localhost:11434",
    });
  }

  return result.message;
}

export function buildStatusSummary(
  initialValues: AppSettings,
  t: (key: string, params?: Record<string, unknown>) => string,
) {
  const activeEmbeddingRoute =
    initialValues.pending_embedding_route ?? initialValues.embedding_route;

  return {
    embedding: formatProviderProfile(activeEmbeddingRoute.provider, activeEmbeddingRoute.model, t),
    response: formatProviderProfile(
      initialValues.response_route.provider,
      initialValues.response_route.model,
      t,
    ),
    vision: formatProviderProfile(
      initialValues.vision_route.provider,
      initialValues.vision_route.model,
      t,
    ),
  };
}
