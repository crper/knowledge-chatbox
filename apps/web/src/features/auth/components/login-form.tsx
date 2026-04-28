import { useForm, revalidateLogic } from "@tanstack/react-form";
import { useTranslation } from "react-i18next";

import { Button } from "@/components/ui/button";
import { FieldGroup } from "@/components/ui/field";
import { Form } from "@/components/ui/form";
import { FormTextField } from "@/lib/form/form-fields";
import { FormErrorAlert } from "@/lib/form/form-feedback";
import { getFirstFormError, zodFieldErrors } from "@/lib/forms";
import { loginSchema } from "@/lib/validation/schemas";

type LoginFormProps = {
  errorMessage?: string | null;
  onFieldChange?: () => void;
  onSubmit: (input: { username: string; password: string }) => Promise<void>;
};

export function LoginForm({ errorMessage = null, onFieldChange, onSubmit }: LoginFormProps) {
  const { t } = useTranslation("auth");
  const form = useForm({
    defaultValues: {
      password: "",
      username: "",
    },
    validators: {
      onChange: ({ value }) => zodFieldErrors(loginSchema, value, "auth:loginValidationError"),
    },
    validationLogic: revalidateLogic({ mode: "submit", modeAfterSubmission: "blur" }),
    onSubmit: async ({ value }) => {
      await onSubmit({
        password: value.password,
        username: value.username.trim(),
      });
    },
  });

  return (
    <Form
      className="flex flex-col gap-5"
      onSubmit={(e) => {
        e.preventDefault();
        void form.handleSubmit();
      }}
    >
      <FieldGroup className="gap-4">
        <FormTextField
          autoComplete="username"
          className="h-11 rounded-xl border-border/80 bg-background/68 px-4 focus-visible:bg-background/82"
          form={form}
          id="login-username"
          label={t("usernameLabel")}
          labelClassName="pl-4 text-sm font-medium tracking-[-0.01em]"
          name="username"
          onChange={onFieldChange}
          placeholder={t("usernameLabel")}
          t={t}
        />
        <FormTextField
          autoComplete="current-password"
          className="h-11 rounded-xl border-border/80 bg-background/68 px-4 focus-visible:bg-background/82"
          form={form}
          id="login-password"
          label={t("passwordLabel")}
          labelClassName="pl-4 text-sm font-medium tracking-[-0.01em]"
          name="password"
          onChange={onFieldChange}
          placeholder={t("passwordLabel")}
          t={t}
          type="password"
        />
      </FieldGroup>
      <form.Subscribe selector={(state) => state.errorMap.onChange}>
        {(onChangeError) => {
          const formErrorMessage = getFirstFormError(onChangeError, t);
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
      <form.Subscribe selector={(state) => [state.canSubmit, state.isSubmitting] as const}>
        {([canSubmit, isSubmitting]) => (
          <Button
            className="mt-1 h-11 w-full rounded-xl"
            disabled={!canSubmit}
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
