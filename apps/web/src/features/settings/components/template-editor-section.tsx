/**
 * @file Provider 模板编辑分区模块。
 */

import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { getProviderLabel } from "@/lib/provider-display";
import { type ProviderSettingsView, type TemplateProviderName } from "./provider-form-state";
import {
  getNonPrimaryTemplateOptions,
  providerFormControlClassName,
  providerFormInsetSectionClassName,
  renderProfileFields,
  updateTemplateProfileField,
} from "./provider-form-shared";

export function TemplateEditorSection({
  draft,
  handleViewChange,
  t,
}: {
  draft: ProviderSettingsView;
  handleViewChange: (updater: (current: ProviderSettingsView) => ProviderSettingsView) => void;
  t: (key: string, params?: Record<string, unknown>) => string;
}) {
  const nonPrimaryTemplateOptions = getNonPrimaryTemplateOptions(draft.primaryProvider);
  const templateProvider = nonPrimaryTemplateOptions.includes(draft.templateProvider)
    ? draft.templateProvider
    : (nonPrimaryTemplateOptions[0] ?? "openai");

  return (
    <section className={providerFormInsetSectionClassName}>
      <div className="space-y-1.5">
        <h3 className="text-sm font-medium">{t("templateEditorTitle")}</h3>
        <p className="text-sm leading-6 text-muted-foreground">{t("templateEditorDescription")}</p>
      </div>
      <FieldGroup className="mt-4">
        <Field>
          <FieldLabel>{t("templateProviderLabel")}</FieldLabel>
          <Select
            onValueChange={(value) =>
              handleViewChange((current) => ({
                ...current,
                templateProvider: value as TemplateProviderName,
              }))
            }
            value={templateProvider}
          >
            <SelectTrigger
              aria-label={t("templateProviderLabel")}
              className={providerFormControlClassName}
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {nonPrimaryTemplateOptions.map((provider) => (
                <SelectItem key={provider} value={provider}>
                  {getProviderLabel(provider, t)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
      </FieldGroup>
      <div className="mt-4">
        {renderProfileFields({
          includeModelFields: true,
          onChange: (key, value) =>
            handleViewChange((current) =>
              updateTemplateProfileField(current, templateProvider, key, value),
            ),
          profile: draft.providerProfiles[templateProvider],
          provider: templateProvider,
          t,
        })}
      </div>
    </section>
  );
}
