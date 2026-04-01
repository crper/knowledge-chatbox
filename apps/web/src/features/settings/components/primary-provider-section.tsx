/**
 * @file Provider 主配置分区模块。
 */

import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { getProviderLabel } from "@/lib/provider-display";
import { toFieldErrorItems } from "@/lib/forms";
import {
  getDefaultEmbeddingProvider,
  PRIMARY_PROVIDER_OPTIONS,
  type ProviderSettingsView,
  type PrimaryProviderName,
  updatePrimaryProvider,
} from "./provider-form-state";
import {
  getProfileFieldValue,
  PROFILE_FIELDS,
  providerFormControlClassName,
  updatePrimaryProfileField,
  updateTemplateProfileField,
} from "./provider-form-shared";

export function PrimaryProviderSection({
  chatModelLabel,
  embeddingModelLabel,
  fieldErrorMessages,
  fieldRefs,
  handleViewChange,
  t,
  visionModelLabel,
  draft,
}: {
  chatModelLabel: string;
  embeddingModelLabel: string;
  fieldErrorMessages: {
    chatModel?: string;
    embeddingModel?: string;
    primaryBaseUrl?: string;
    visionModel?: string;
  };
  fieldRefs: React.RefObject<Partial<Record<string, HTMLInputElement | null>>>;
  handleViewChange: (updater: (current: ProviderSettingsView) => ProviderSettingsView) => void;
  t: (key: string, params?: Record<string, unknown>) => string;
  visionModelLabel: string;
  draft: ProviderSettingsView;
}) {
  const primaryConnectionFields = PROFILE_FIELDS[draft.primaryProvider].filter(
    (field) => !field.key.endsWith("_model"),
  );

  return (
    <section className="rounded-[1.5rem] border border-border/60 bg-background/55 px-5 py-5">
      <div className="mb-5">
        <h2 className="text-sm font-medium">{t("providerCategoryTitle")}</h2>
      </div>

      <FieldGroup className="grid gap-5 md:grid-cols-2">
        <Field>
          <FieldLabel>{t("primaryProviderLabel")}</FieldLabel>
          <Select
            onValueChange={(value) =>
              handleViewChange((current) =>
                updatePrimaryProvider(current, value as PrimaryProviderName),
              )
            }
            value={draft.primaryProvider}
          >
            <SelectTrigger
              aria-label={t("primaryProviderLabel")}
              className={providerFormControlClassName}
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {PRIMARY_PROVIDER_OPTIONS.map((provider) => (
                <SelectItem key={provider} value={provider}>
                  {getProviderLabel(provider, t)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <FieldDescription>{t("primaryProviderHint")}</FieldDescription>
        </Field>
        <Field>
          <FieldLabel>{chatModelLabel}</FieldLabel>
          <Input
            aria-label={chatModelLabel}
            aria-invalid={Boolean(fieldErrorMessages.chatModel)}
            className={providerFormControlClassName}
            onChange={(event) =>
              handleViewChange((current) =>
                updatePrimaryProfileField(current, "chat_model", event.target.value),
              )
            }
            ref={(node) => {
              fieldRefs.current.chatModel = node;
            }}
            value={draft.chatModel}
          />
          <FieldError
            errors={toFieldErrorItems([], undefined, fieldErrorMessages.chatModel ?? undefined)}
          />
        </Field>
        <Field>
          <FieldLabel>{embeddingModelLabel}</FieldLabel>
          <Input
            aria-label={embeddingModelLabel}
            aria-invalid={Boolean(fieldErrorMessages.embeddingModel)}
            className={providerFormControlClassName}
            onChange={(event) =>
              handleViewChange((current) => {
                const defaultProvider = getDefaultEmbeddingProvider(current.primaryProvider);
                const next = updateTemplateProfileField(
                  current,
                  defaultProvider,
                  "embedding_model",
                  event.target.value,
                );

                return {
                  ...next,
                  embeddingModel: event.target.value,
                  retrievalEmbeddingModel: next.retrievalOverrideEnabled
                    ? next.retrievalEmbeddingModel
                    : event.target.value,
                };
              })
            }
            ref={(node) => {
              fieldRefs.current.embeddingModel = node;
            }}
            value={draft.embeddingModel}
          />
          <FieldError
            errors={toFieldErrorItems(
              [],
              undefined,
              fieldErrorMessages.embeddingModel ?? undefined,
            )}
          />
        </Field>
        <Field>
          <FieldLabel>{visionModelLabel}</FieldLabel>
          <Input
            aria-label={visionModelLabel}
            aria-invalid={Boolean(fieldErrorMessages.visionModel)}
            className={providerFormControlClassName}
            onChange={(event) =>
              handleViewChange((current) =>
                updatePrimaryProfileField(current, "vision_model", event.target.value),
              )
            }
            ref={(node) => {
              fieldRefs.current.visionModel = node;
            }}
            value={draft.visionModel}
          />
          <FieldDescription>{t("visionModelHint")}</FieldDescription>
          <FieldError
            errors={toFieldErrorItems([], undefined, fieldErrorMessages.visionModel ?? undefined)}
          />
        </Field>
        {primaryConnectionFields.map((field) => (
          <Field key={`primary-${field.key}`}>
            <FieldLabel>{field.label}</FieldLabel>
            <Input
              aria-label={field.label}
              aria-invalid={field.key === "base_url" && Boolean(fieldErrorMessages.primaryBaseUrl)}
              className={providerFormControlClassName}
              onChange={(event) =>
                handleViewChange((current) =>
                  updatePrimaryProfileField(current, field.key, event.target.value),
                )
              }
              ref={(node) => {
                if (field.key === "base_url") {
                  fieldRefs.current.primaryBaseUrl = node;
                }
              }}
              type={field.type ?? "text"}
              value={getProfileFieldValue(draft.providerProfiles[draft.primaryProvider], field.key)}
            />
            {field.hint ? <FieldDescription>{t(field.hint)}</FieldDescription> : null}
            {field.key === "base_url" ? (
              <FieldError
                errors={toFieldErrorItems(
                  [],
                  undefined,
                  fieldErrorMessages.primaryBaseUrl ?? undefined,
                )}
              />
            ) : null}
          </Field>
        ))}
      </FieldGroup>
    </section>
  );
}
