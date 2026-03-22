/**
 * @file 设置表单通用分区模块。
 */

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Field, FieldDescription, FieldError, FieldLabel } from "@/components/ui/field";
import { Spinner } from "@/components/ui/spinner";
import { Textarea } from "@/components/ui/textarea";
import { getFormErrorMessages } from "@/lib/forms";

function toFieldErrors(errors: unknown[], manualError?: string) {
  const messages = [...getFormErrorMessages(errors), manualError].filter(
    (message): message is string => typeof message === "string" && message.trim().length > 0,
  );

  return messages.map((message) => ({ message }));
}

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
    <section className="surface-panel-subtle rounded-[1.5rem] px-5 py-5">
      <div className="mb-5">
        <h2 className="text-sm font-medium">{t("systemPromptSectionTitle")}</h2>
      </div>
      <form.Field name="system_prompt">
        {(field: any) => (
          <Field>
            <FieldLabel htmlFor="settings-system-prompt">{t("systemPromptLabel")}</FieldLabel>
            <Textarea
              aria-label={t("systemPromptLabel")}
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
              errors={toFieldErrors(field.state.meta.errors, manualFieldErrors?.system_prompt)}
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
  notice?: { message: string; title: string; variant?: "default" | "destructive" } | null;
  onTest: () => void;
  savePending?: boolean;
  showTestAction?: boolean;
  t: (key: string, params?: Record<string, unknown>) => string;
  testPending?: boolean;
}) {
  const showError = typeof errorMessage === "string" && errorMessage.trim().length > 0;

  return (
    <section className="surface-panel-subtle rounded-[1.5rem] px-5 py-5">
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
        </Alert>
      ) : (
        <p className="mt-4 text-sm leading-6 text-muted-foreground">{t("saveHint")}</p>
      )}
    </section>
  );
}
