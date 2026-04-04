/**
 * @file Provider 表单共享辅助模块。
 */

import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { formatProviderProfile } from "@/lib/provider-display";
import { toFieldErrorItems } from "@/lib/forms";
import type { AppSettings, CapabilityHealthResult } from "../api/settings";
import {
  TEMPLATE_PROVIDER_OPTIONS,
  type PrimaryProviderName,
  type ProviderProfileModels,
  type ProviderSettingsView,
  type TemplateProviderName,
} from "./provider-form-state";

export type ProfileFieldDefinition = {
  hint?: string;
  key: "api_key" | "base_url" | "chat_model" | "embedding_model" | "vision_model";
  label: string;
  type?: "password" | "text";
};

export const providerFormControlClassName =
  "h-11 rounded-xl border-border/80 bg-background/80 md:h-10";
export const providerFormInsetSectionClassName =
  "rounded-[1.25rem] border border-border/60 bg-background/58 p-4";

export const PROFILE_FIELDS: Record<TemplateProviderName, ProfileFieldDefinition[]> = {
  openai: [
    { key: "api_key", label: "OpenAI API Key", type: "password" },
    { hint: "openAiBaseUrlHint", key: "base_url", label: "OpenAI Base URL" },
    { key: "chat_model", label: "OpenAI Chat Model" },
    { key: "embedding_model", label: "OpenAI Embedding Model" },
    { key: "vision_model", label: "OpenAI Vision Model" },
  ],
  anthropic: [
    { key: "api_key", label: "Anthropic API Key", type: "password" },
    { hint: "claudeBaseUrlHint", key: "base_url", label: "Anthropic Base URL" },
    { key: "chat_model", label: "Anthropic Chat Model" },
    { key: "vision_model", label: "Anthropic Vision Model" },
  ],
  voyage: [
    { key: "api_key", label: "Voyage API Key", type: "password" },
    { hint: "voyageBaseUrlHint", key: "base_url", label: "Voyage Base URL" },
    { hint: "voyageEmbeddingHint", key: "embedding_model", label: "Voyage Embedding Model" },
  ],
  ollama: [
    { key: "base_url", label: "Ollama Base URL" },
    { key: "chat_model", label: "Ollama Chat Model" },
    { key: "embedding_model", label: "Ollama Embedding Model" },
    { key: "vision_model", label: "Ollama Vision Model" },
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
  inputRef?: (key: ProfileFieldDefinition["key"], node: HTMLInputElement | null) => void;
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
      {visibleFields.map((field) => (
        <Field key={`${provider}-${field.key}`}>
          <FieldLabel>{field.label}</FieldLabel>
          <Input
            aria-label={field.label}
            aria-invalid={Boolean(manualFieldErrors?.[field.key])}
            className={providerFormControlClassName}
            onChange={(event) => onChange(field.key, event.target.value)}
            ref={(node) => inputRef?.(field.key, node)}
            type={field.type ?? "text"}
            value={getProfileFieldValue(profile, field.key)}
          />
          {field.hint ? <FieldDescription>{t(field.hint)}</FieldDescription> : null}
          <FieldError errors={toFieldErrorItems([], undefined, manualFieldErrors?.[field.key])} />
        </Field>
      ))}
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
