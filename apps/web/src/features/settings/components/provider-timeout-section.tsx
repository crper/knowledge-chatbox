/**
 * @file Provider 超时分区模块。
 */

import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { getFieldErrorItems } from "@/lib/form/form-feedback";
import type { ProviderSettingsView } from "./provider-form-state";
import {
  providerFormControlClassName,
  providerFormInsetSectionClassName,
} from "./provider-form-shared";

export function ProviderTimeoutSection({
  draft,
  fieldErrorMessages,
  fieldRefs,
  handleViewChange,
  t,
}: {
  draft: ProviderSettingsView;
  fieldErrorMessages: {
    providerTimeoutSeconds?: string;
  };
  fieldRefs: React.RefObject<Partial<Record<string, HTMLElement | null>>>;
  handleViewChange: (updater: (current: ProviderSettingsView) => ProviderSettingsView) => void;
  t: (key: string, params?: Record<string, unknown>) => string;
}) {
  return (
    <section className={providerFormInsetSectionClassName}>
      <div className="space-y-1.5">
        <h3 className="text-sm font-medium">{t("providerTimeoutLabel")}</h3>
        <p className="text-sm leading-6 text-muted-foreground">
          {t("providerTimeoutSectionDescription")}
        </p>
      </div>
      <FieldGroup className="mt-4">
        <Field>
          <FieldLabel>{t("providerTimeoutLabel")}</FieldLabel>
          <Input
            aria-label={t("providerTimeoutLabel")}
            aria-invalid={Boolean(fieldErrorMessages.providerTimeoutSeconds)}
            className={providerFormControlClassName}
            min="1"
            onChange={(event) =>
              handleViewChange((current) => ({
                ...current,
                providerTimeoutSeconds: Number(event.target.value || "0"),
              }))
            }
            ref={(node) => {
              fieldRefs.current.providerTimeoutSeconds = node;
            }}
            type="number"
            value={String(draft.providerTimeoutSeconds)}
          />
          <FieldDescription>{t("providerTimeoutHint")}</FieldDescription>
          <FieldError
            errors={getFieldErrorItems([], undefined, fieldErrorMessages.providerTimeoutSeconds)}
          />
        </Field>
      </FieldGroup>
    </section>
  );
}
