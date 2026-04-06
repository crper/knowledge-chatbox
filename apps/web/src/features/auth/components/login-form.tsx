/**
 * @file 认证相关界面组件模块。
 */

import type { FormEvent } from "react";
import { useTranslation } from "react-i18next";

import { Button } from "@/components/ui/button";
import { Field, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Form } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { FormErrorAlert, getFieldErrorItems, getFormErrorMessage } from "@/lib/form/form-feedback";
import { useAppForm } from "@/lib/form/use-app-form";
import { handleFormSubmitEvent } from "@/lib/forms";
import { loginSchema } from "@/lib/validation/schemas";

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
  const form = useAppForm({
    defaultValues: {
      password: "",
      username: "",
    },
    formI18nKey: "auth:loginValidationError",
    onSubmit: async ({ value }) => {
      await onSubmit({
        password: value.password,
        username: value.username.trim(),
      });
    },
    schema: loginSchema,
  });

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    void handleFormSubmitEvent(event, () => form.handleSubmit());
  };

  return (
    <Form className="flex flex-col gap-5" onSubmit={handleSubmit}>
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
                aria-invalid={field.state.meta.errors.length > 0}
                autoComplete="username"
                className="h-11 rounded-xl border-border/80 bg-background/68 px-4 focus-visible:bg-background/82"
                id="login-username"
                onChange={(event) => {
                  onFieldChange?.();
                  field.handleChange(event.target.value);
                }}
                onBlur={() => field.handleBlur()}
                placeholder={t("usernameLabel")}
                value={field.state.value}
              />
              <FieldError errors={getFieldErrorItems(field.state.meta.errors, t)} />
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
                aria-invalid={field.state.meta.errors.length > 0}
                autoComplete="current-password"
                className="h-11 rounded-xl border-border/80 bg-background/68 px-4 focus-visible:bg-background/82"
                id="login-password"
                onChange={(event) => {
                  onFieldChange?.();
                  field.handleChange(event.target.value);
                }}
                onBlur={() => field.handleBlur()}
                placeholder={t("passwordLabel")}
                type="password"
                value={field.state.value}
              />
              <FieldError errors={getFieldErrorItems(field.state.meta.errors, t)} />
            </Field>
          )}
        </form.Field>
      </FieldGroup>
      <form.Subscribe selector={(state) => state.errorMap.onDynamic}>
        {(dynamicError) => {
          const formErrorMessage = getFormErrorMessage([dynamicError], t);
          const feedbackMessage = formErrorMessage || errorMessage;

          return (
            <div
              aria-atomic="true"
              aria-live="polite"
              className="min-h-4"
              data-slot="login-feedback"
            >
              <FormErrorAlert message={feedbackMessage} />
            </div>
          );
        }}
      </form.Subscribe>
      <form.Subscribe selector={(state) => state.isSubmitting}>
        {(isSubmitting) => (
          <Button
            className="mt-1 h-11 w-full rounded-xl"
            disabled={isSubmitting}
            size="lg"
            type="submit"
          >
            {isSubmitting ? t("loginPendingAction") : t("loginAction")}
          </Button>
        )}
      </form.Subscribe>
    </Form>
  );
}
