/**
 * @file 用户相关界面组件模块。
 */

import { useEffect } from "react";
import { revalidateLogic, useForm } from "@tanstack/react-form";
import type { FormEvent } from "react";
import { useTranslation } from "react-i18next";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Field, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import {
  buildFormValidationResult,
  formError,
  getFirstFormError,
  handleFormSubmitEvent,
  minLength,
  toFieldErrorItems,
  trimmedRequired,
} from "@/lib/forms";

type CreateUserDialogProps = {
  open: boolean;
  onClose: () => void;
  onSubmit: (input: {
    username: string;
    password: string;
    role: "admin" | "user";
  }) => Promise<void>;
};

/**
 * 渲染创建用户对话框。
 */
export function CreateUserDialog({ open, onClose, onSubmit }: CreateUserDialogProps) {
  const { t } = useTranslation(["users", "common"]);
  const form = useForm({
    defaultValues: {
      password: "",
      username: "",
    },
    validationLogic: revalidateLogic({
      mode: "submit",
      modeAfterSubmission: "blur",
    }),
    validators: {
      onDynamic: ({ value }) => {
        const username = trimmedRequired(value.username, "usernameRequiredError");
        const password =
          trimmedRequired(value.password, "initialPasswordRequiredError") ??
          minLength(value.password, 8, "passwordLengthValidationError");

        if (!username && !password) {
          return undefined;
        }

        return buildFormValidationResult(formError("createUserValidationError"), {
          password,
          username,
        });
      },
    },
    onSubmit: async ({ formApi, value }) => {
      try {
        await onSubmit({ password: value.password, role: "user", username: value.username.trim() });
        onClose();
      } catch (error) {
        formApi.setErrorMap({
          onSubmit: {
            fields: {},
            form: error instanceof Error ? error.message : t("createUserFailed"),
          },
        });
        throw error;
      }
    },
  });

  useEffect(() => {
    if (!open) {
      form.reset({
        password: "",
        username: "",
      });
      form.setErrorMap({ onSubmit: undefined });
    }
  }, [form, open]);

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    void handleFormSubmitEvent(event, () => form.handleSubmit());
  };

  return (
    <Dialog onOpenChange={(nextOpen) => !nextOpen && onClose()} open={open}>
      <DialogContent className="sm:max-w-md" closeLabel={t("closeAction", { ns: "common" })}>
        <DialogHeader>
          <DialogTitle>{t("createUserTitle")}</DialogTitle>
          <DialogDescription>{t("createUserDescription")}</DialogDescription>
        </DialogHeader>
        <form className="flex flex-col gap-4" onSubmit={handleSubmit}>
          <FieldGroup>
            <form.Field name="username">
              {(field) => (
                <Field>
                  <FieldLabel htmlFor="create-user-username">{t("newUsernameLabel")}</FieldLabel>
                  <Input
                    aria-label={t("newUsernameLabel")}
                    aria-invalid={field.state.meta.errors.length > 0}
                    autoComplete="username"
                    className="h-10 rounded-xl border-border/80 bg-background/80"
                    id="create-user-username"
                    onChange={(event) => {
                      form.setErrorMap({ onSubmit: undefined });
                      field.handleChange(event.target.value);
                    }}
                    onBlur={() => field.handleBlur()}
                    value={field.state.value}
                  />
                  <FieldError errors={toFieldErrorItems(field.state.meta.errors, t)} />
                </Field>
              )}
            </form.Field>
            <form.Field name="password">
              {(field) => (
                <Field>
                  <FieldLabel htmlFor="create-user-password">
                    {t("initialPasswordLabel")}
                  </FieldLabel>
                  <Input
                    aria-label={t("initialPasswordLabel")}
                    aria-invalid={field.state.meta.errors.length > 0}
                    autoComplete="new-password"
                    className="h-10 rounded-xl border-border/80 bg-background/80"
                    id="create-user-password"
                    onChange={(event) => {
                      form.setErrorMap({ onSubmit: undefined });
                      field.handleChange(event.target.value);
                    }}
                    onBlur={() => field.handleBlur()}
                    type="password"
                    value={field.state.value}
                  />
                  <FieldError errors={toFieldErrorItems(field.state.meta.errors, t)} />
                </Field>
              )}
            </form.Field>
          </FieldGroup>
          <form.Subscribe selector={(state) => state.errorMap}>
            {(errorMap) => {
              const errorMessage = getFirstFormError([errorMap.onDynamic, errorMap.onSubmit], t);
              return errorMessage ? (
                <Alert variant="destructive">
                  <AlertDescription>{errorMessage}</AlertDescription>
                </Alert>
              ) : null;
            }}
          </form.Subscribe>
          <DialogFooter>
            <form.Subscribe selector={(state) => state.isSubmitting}>
              {(isSubmitting) => (
                <>
                  <Button
                    disabled={isSubmitting}
                    onClick={onClose}
                    size="lg"
                    type="button"
                    variant="ghost"
                  >
                    {t("cancelAction")}
                  </Button>
                  <Button disabled={isSubmitting} size="lg" type="submit">
                    {isSubmitting ? t("submitCreatePendingAction") : t("submitCreateAction")}
                  </Button>
                </>
              )}
            </form.Subscribe>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
