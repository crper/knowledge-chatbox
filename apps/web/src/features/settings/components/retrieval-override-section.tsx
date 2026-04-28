/**
 * @file Provider 检索覆盖分区模块。
 */

const EMBEDDING_PROVIDER_OPTIONS = ["openai", "voyage", "ollama"] as const;

import { Field, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { fieldError } from "@/lib/forms";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { getProviderLabel } from "@/lib/provider-display";
import type { EmbeddingProviderName } from "../api/settings";
import {
  getRetrievalEmbeddingModel,
  type ProviderSettingsView,
  toggleRetrievalOverride,
} from "./provider-form-state";
import {
  providerFormControlClassName,
  providerFormInsetSectionClassName,
  updateTemplateProfileField,
} from "./provider-form-shared";

export function RetrievalOverrideSection({
  draft,
  fieldErrorMessages,
  fieldRefs,
  handleViewChange,
  retrievalEmbeddingModelLabel,
  t,
}: {
  draft: ProviderSettingsView;
  fieldErrorMessages: {
    retrievalEmbeddingModel?: string;
  };
  fieldRefs: React.RefObject<Partial<Record<string, HTMLElement | null>>>;
  handleViewChange: (updater: (current: ProviderSettingsView) => ProviderSettingsView) => void;
  retrievalEmbeddingModelLabel: string;
  t: (key: string, params?: Record<string, unknown>) => string;
}) {
  return (
    <section className={providerFormInsetSectionClassName}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-1.5">
          <h3 className="text-sm font-medium">{t("retrievalOverrideTitle")}</h3>
          <p className="text-sm leading-6 text-muted-foreground">
            {t("retrievalOverrideDescription")}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Switch
            aria-label={t("retrievalOverrideTitle")}
            checked={draft.retrievalOverrideEnabled}
            onCheckedChange={() => handleViewChange(toggleRetrievalOverride)}
          />
          <span className="text-sm text-muted-foreground">
            {draft.retrievalOverrideEnabled
              ? t("retrievalOverrideDisableAction")
              : t("retrievalOverrideAction")}
          </span>
        </div>
      </div>

      {draft.retrievalOverrideEnabled ? (
        <FieldGroup className="mt-4 grid gap-5 md:grid-cols-2">
          <Field>
            <FieldLabel>{t("retrievalProviderLabel")}</FieldLabel>
            <Select
              items={EMBEDDING_PROVIDER_OPTIONS.map((provider) => ({
                label: getProviderLabel(provider as EmbeddingProviderName, t),
                value: provider,
              }))}
              onValueChange={(value) =>
                handleViewChange((current) => ({
                  ...current,
                  retrievalProvider: value as EmbeddingProviderName,
                }))
              }
              value={draft.retrievalProvider}
            >
              <SelectTrigger
                aria-label={t("retrievalProviderLabel")}
                className={providerFormControlClassName}
              >
                <SelectValue>{() => getProviderLabel(draft.retrievalProvider, t)}</SelectValue>
              </SelectTrigger>
              <SelectContent>
                {EMBEDDING_PROVIDER_OPTIONS.map((provider) => (
                  <SelectItem key={provider} value={provider}>
                    {getProviderLabel(provider as EmbeddingProviderName, t)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <Field>
            <FieldLabel>{retrievalEmbeddingModelLabel}</FieldLabel>
            <Input
              aria-label={retrievalEmbeddingModelLabel}
              aria-invalid={Boolean(fieldErrorMessages.retrievalEmbeddingModel)}
              className={providerFormControlClassName}
              onChange={(event) =>
                handleViewChange((current) =>
                  updateTemplateProfileField(
                    current,
                    current.retrievalProvider,
                    "embedding_model",
                    event.target.value,
                  ),
                )
              }
              ref={(node) => {
                fieldRefs.current.retrievalEmbeddingModel = node;
              }}
              value={getRetrievalEmbeddingModel(draft)}
            />
            <FieldError errors={fieldError(fieldErrorMessages.retrievalEmbeddingModel)} />
          </Field>
        </FieldGroup>
      ) : null}
    </section>
  );
}
