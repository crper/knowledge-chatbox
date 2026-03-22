/**
 * @file 认证相关界面组件模块。
 */

import { useForm } from "@tanstack/react-form";
import type { FormEvent } from "react";
import { useTranslation } from "react-i18next";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { handleFormSubmitEvent } from "@/lib/forms";
import { getFirstFormError } from "@/lib/forms";

type LoginFormProps = {
  errorMessage?: string | null;
  onFieldChange?: () => void;
  onSubmit: (input: { username: string; password: string }) => Promise<void>;
};

/**
 * 渲染登录表单。
 */
export function LoginForm({ errorMessage = null, onFieldChange, onSubmit }: LoginFormProps) {
  const { t } = useTranslation("auth");
  const form = useForm({
    defaultValues: {
      password: "",
      username: "",
    },
    validators: {
      onSubmit: ({ value }) => {
        if (!value.username.trim() || !value.password) {
          return t("loginValidationError");
        }

        return undefined;
      },
    },
    onSubmit: async ({ value }) => {
      await onSubmit({
        password: value.password,
        username: value.username.trim(),
      });
    },
  });

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    void handleFormSubmitEvent(event, () => form.handleSubmit());
  };

  return (
    <form className="flex flex-col gap-5" onSubmit={handleSubmit}>
      <FieldGroup className="gap-4">
        <form.Field name="username">
          {(field) => (
            <Field className="gap-2">
              <FieldLabel
                className="pl-4 text-sm font-medium tracking-[-0.01em]"
                htmlFor="login-username"
              >
                {t("usernameLabel")}
              </FieldLabel>
              <Input
                aria-label={t("usernameLabel")}
                autoComplete="username"
                className="h-11 rounded-[1rem] border-border/80 bg-background/68 px-4 focus-visible:bg-background/82"
                id="login-username"
                onChange={(event) => {
                  onFieldChange?.();
                  form.setErrorMap({ onSubmit: undefined });
                  field.handleChange(event.target.value);
                }}
                placeholder={t("usernameLabel")}
                value={field.state.value}
              />
            </Field>
          )}
        </form.Field>
        <form.Field name="password">
          {(field) => (
            <Field className="gap-2">
              <FieldLabel
                className="pl-4 text-sm font-medium tracking-[-0.01em]"
                htmlFor="login-password"
              >
                {t("passwordLabel")}
              </FieldLabel>
              <Input
                aria-label={t("passwordLabel")}
                autoComplete="current-password"
                className="h-11 rounded-[1rem] border-border/80 bg-background/68 px-4 focus-visible:bg-background/82"
                id="login-password"
                onChange={(event) => {
                  onFieldChange?.();
                  form.setErrorMap({ onSubmit: undefined });
                  field.handleChange(event.target.value);
                }}
                placeholder={t("passwordLabel")}
                type="password"
                value={field.state.value}
              />
            </Field>
          )}
        </form.Field>
      </FieldGroup>
      <form.Subscribe selector={(state) => state.errors}>
        {(errors) => {
          const formErrorMessage = getFirstFormError(errors);
          const feedbackMessage = formErrorMessage || errorMessage;

          return (
            <div
              aria-atomic="true"
              aria-live="polite"
              className="min-h-4"
              data-slot="login-feedback"
            >
              {feedbackMessage ? (
                <Alert variant="destructive">
                  <AlertDescription>{feedbackMessage}</AlertDescription>
                </Alert>
              ) : null}
            </div>
          );
        }}
      </form.Subscribe>
      <form.Subscribe selector={(state) => state.isSubmitting}>
        {(isSubmitting) => (
          <Button
            className="mt-1 h-11 w-full rounded-[1rem]"
            disabled={isSubmitting}
            size="lg"
            type="submit"
          >
            {isSubmitting ? t("loginPendingAction") : t("loginAction")}
          </Button>
        )}
      </form.Subscribe>
    </form>
  );
}
