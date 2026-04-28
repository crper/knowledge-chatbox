/**
 * @file Provider 超时分区模块。
 */

import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { NumberField } from "@/components/ui/number-field";
import { fieldError } from "@/lib/forms";
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
          <NumberField
            allowOutOfRange
            className={providerFormControlClassName}
            id="provider-timeout-seconds"
            inputClassName="w-full"
            onValueChange={(value) =>
              handleViewChange((current) => ({
                ...current,
                providerTimeoutSeconds: value ?? 0,
              }))
            }
            inputRef={(node) => {
              fieldRefs.current.providerTimeoutSeconds = node;
            }}
            value={draft.providerTimeoutSeconds}
          />
          <FieldDescription>{t("providerTimeoutHint")}</FieldDescription>
          <FieldError errors={fieldError(fieldErrorMessages.providerTimeoutSeconds)} />
        </Field>
      </FieldGroup>
    </section>
  );
}
