/**
 * @file 认证相关界面组件模块。
 */

import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import { useTranslation } from "react-i18next";

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
import { Form } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { ApiRequestError, getApiErrorMessage } from "@/lib/api/client";
import { FormErrorAlert, getFieldErrorItems, getFormErrorMessage } from "@/lib/form/form-feedback";
import { useAppForm } from "@/lib/form/use-app-form";
import { handleFormSubmitEvent } from "@/lib/forms";
import { zodToTanStackFormErrors } from "@/lib/validation/form-adapter";
import { changePasswordSchema } from "@/lib/validation/schemas";

type ChangePasswordDialogProps = {
  open: boolean;
  onClose: () => void;
  onSubmit: (input: { currentPassword: string; newPassword: string }) => Promise<void>;
};

/**
 * 渲染修改密码对话框。
 */
export function ChangePasswordDialog({ open, onClose, onSubmit }: ChangePasswordDialogProps) {
  const { t } = useTranslation(["auth", "common"]);
  const [submitError, setSubmitError] = useState<unknown>(null);
  const form = useAppForm({
    defaultValues: {
      currentPassword: "",
      newPassword: "",
    },
    onSubmit: async ({ formApi, value }) => {
      try {
        await onSubmit(value);
        setSubmitError(null);
        onClose();
      } catch (error) {
        setSubmitError(error);
        formApi.setErrorMap({ onSubmit: undefined });
        throw error;
      }
    },
    validator: (value) => {
      const result = changePasswordSchema.safeParse(value);
      if (result.success) {
        return undefined;
      }

      const fieldNames = new Set(
        result.error.issues
          .map((issue) => issue.path[0])
          .filter((fieldName): fieldName is string => typeof fieldName === "string"),
      );

      return zodToTanStackFormErrors(result.error, {
        formI18nKey:
          !fieldNames.has("currentPassword") && fieldNames.has("newPassword")
            ? "auth:changePasswordValidationError"
            : undefined,
      });
    },
  });

  useEffect(() => {
    if (!open) {
      form.reset({
        currentPassword: "",
        newPassword: "",
      });
      form.setErrorMap({ onSubmit: undefined });
      setSubmitError(null);
    }
  }, [form, open]);

  const getSubmitErrorMessage = () => {
    if (submitError instanceof ApiRequestError && submitError.code === "invalid_credentials") {
      return t("currentPasswordIncorrectError");
    }

    if (submitError instanceof ApiRequestError) {
      return getApiErrorMessage(submitError);
    }

    return submitError ? t("changePasswordFailed") : null;
  };

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    void handleFormSubmitEvent(event, () => form.handleSubmit());
  };

  return (
    <Dialog onOpenChange={(nextOpen) => !nextOpen && onClose()} open={open}>
      <DialogContent className="sm:max-w-md" closeLabel={t("closeAction", { ns: "common" })}>
        <DialogHeader>
          <DialogTitle>{t("changePasswordTitle")}</DialogTitle>
          <DialogDescription>{t("changePasswordDescription")}</DialogDescription>
        </DialogHeader>
        <Form className="flex flex-col gap-4" onSubmit={handleSubmit}>
          <FieldGroup>
            <form.Field name="currentPassword">
              {(field) => (
                <Field>
                  <FieldLabel htmlFor="current-password">{t("currentPasswordLabel")}</FieldLabel>
                  <Input
                    aria-label={t("currentPasswordLabel")}
                    aria-invalid={field.state.meta.errors.length > 0}
                    autoComplete="current-password"
                    className="h-10 rounded-xl border-border/80 bg-background/80"
                    id="current-password"
                    onChange={(event) => {
                      setSubmitError(null);
                      field.handleChange(event.target.value);
                    }}
                    onBlur={() => field.handleBlur()}
                    type="password"
                    value={field.state.value}
                  />
                  <FieldError errors={getFieldErrorItems(field.state.meta.errors, t)} />
                </Field>
              )}
            </form.Field>
            <form.Field name="newPassword">
              {(field) => (
                <Field>
                  <FieldLabel htmlFor="new-password">{t("newPasswordLabel")}</FieldLabel>
                  <Input
                    aria-label={t("newPasswordLabel")}
                    aria-invalid={field.state.meta.errors.length > 0}
                    autoComplete="new-password"
                    className="h-10 rounded-xl border-border/80 bg-background/80"
                    id="new-password"
                    onChange={(event) => {
                      setSubmitError(null);
                      field.handleChange(event.target.value);
                    }}
                    onBlur={() => field.handleBlur()}
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
              const errorMessage = getFormErrorMessage([dynamicError], t);
              const submitErrorMessage = getSubmitErrorMessage();
              const displayError = errorMessage || submitErrorMessage;
              return <FormErrorAlert message={displayError} />;
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
                    {isSubmitting ? t("submitPendingAction") : t("submitAction")}
                  </Button>
                </>
              )}
            </form.Subscribe>
          </DialogFooter>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
