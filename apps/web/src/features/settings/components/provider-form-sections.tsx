/**
 * @file 设置表单通用分区模块。
 */

import type { FormNotice } from "@/features/settings/components/provider-form";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Field, FieldDescription, FieldError } from "@/components/ui/field";
import { Spinner } from "@/components/ui/spinner";
import { Textarea } from "@/components/ui/textarea";
import { getFieldErrorItems } from "@/lib/form/form-feedback";

export function SystemPromptSection({
  form,
  manualFieldErrors,
  onValueChange,
  t,
}: {
  form: any;
  manualFieldErrors?: Partial<Record<string, string>>;
  onValueChange?: () => void;
  t: (key: string, params?: Record<string, unknown>) => string;
}) {
  return (
    <section className="surface-panel-subtle rounded-2xl px-5 py-5">
      <div className="mb-5">
        <h2 className="text-sm font-medium">{t("systemPromptSectionTitle")}</h2>
      </div>
      <form.Field name="system_prompt">
        {(field: any) => (
          <Field>
            <Textarea
              aria-label={t("systemPromptSectionTitle")}
              className="min-h-32 rounded-2xl border-border/80 bg-background/68"
              id="settings-system-prompt"
              onChange={(event) => {
                onValueChange?.();
                field.handleChange(event.target.value);
              }}
              placeholder={t("systemPromptPlaceholder")}
              value={(field.state.value as string | undefined) ?? ""}
            />
            <FieldDescription>{t("systemPromptHint")}</FieldDescription>
            <FieldError
              errors={getFieldErrorItems(
                field.state.meta.errors,
                t,
                manualFieldErrors?.system_prompt,
              )}
            />
          </Field>
        )}
      </form.Field>
    </section>
  );
}

export function SettingsActionBar({
  errorMessage,
  notice,
  onTest,
  savePending,
  showTestAction = true,
  t,
  testPending,
}: {
  errorMessage?: string | null;
  notice?: FormNotice | null;
  onTest: () => void;
  savePending?: boolean;
  showTestAction?: boolean;
  t: (key: string, params?: Record<string, unknown>) => string;
  testPending?: boolean;
}) {
  const showError = typeof errorMessage === "string" && errorMessage.trim().length > 0;

  return (
    <section className="surface-panel-subtle rounded-2xl px-5 py-5">
      <div className="mb-5">
        <h2 className="text-sm font-medium">{t("saveSectionTitle")}</h2>
      </div>
      <div className="flex flex-wrap gap-3">
        <Button disabled={savePending || testPending} size="lg" type="submit">
          {savePending ? (
            <>
              <Spinner aria-hidden="true" className="size-4" />
              {t("savePendingAction")}
            </>
          ) : (
            t("saveAction")
          )}
        </Button>
        {showTestAction ? (
          <Button
            disabled={savePending || testPending}
            onClick={onTest}
            size="lg"
            type="button"
            variant="outline"
          >
            {testPending ? (
              <>
                <Spinner aria-hidden="true" className="size-4" />
                {t("testConnectionPendingAction")}
              </>
            ) : (
              t("testConnectionAction")
            )}
          </Button>
        ) : null}
      </div>
      {showError ? (
        <Alert
          className="mt-4 rounded-xl border-destructive/30 bg-destructive/5 px-4 py-3"
          variant="destructive"
        >
          <AlertDescription className="text-destructive">{errorMessage}</AlertDescription>
        </Alert>
      ) : notice ? (
        <Alert className="mt-4 rounded-xl bg-background/48 px-4 py-3">
          <AlertTitle>{notice.title}</AlertTitle>
          <AlertDescription className="mt-1 whitespace-pre-line">{notice.message}</AlertDescription>
          {"items" in notice && Array.isArray(notice.items) && notice.items.length > 0 ? (
            <ul aria-label={t("connectionStatusListLabel")} className="mt-3 space-y-2">
              {notice.items.map((item) => (
                <li
                  key={item.label}
                  className="flex flex-col gap-1 rounded-lg border border-border/60 bg-background/40 px-3 py-2"
                >
                  <span className="text-sm font-medium">{item.label}</span>
                  <span className="text-sm text-muted-foreground">{item.message}</span>
                </li>
              ))}
            </ul>
          ) : null}
        </Alert>
      ) : (
        <p className="mt-4 text-sm leading-6 text-muted-foreground">{t("saveHint")}</p>
      )}
    </section>
  );
}
