/**
 * @file 用户密码重置对话框模块。
 */

import { useEffect } from "react";
import { useForm } from "@tanstack/react-form";
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
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { getFirstFormError, handleFormSubmitEvent } from "@/lib/forms";

type ResetPasswordDialogProps = {
  open: boolean;
  username: string;
  onClose: () => void;
  onSubmit: (input: { newPassword: string }) => Promise<void>;
};

/**
 * 渲染重置密码对话框。
 */
export function ResetPasswordDialog({
  open,
  username,
  onClose,
  onSubmit,
}: ResetPasswordDialogProps) {
  const { t } = useTranslation(["users", "auth", "common"]);
  const form = useForm({
    defaultValues: {
      newPassword: "",
    },
    validators: {
      onSubmit: ({ value }) => {
        if (value.newPassword.length < 8) {
          return t("resetPasswordValidationError", { ns: "users" });
        }

        return undefined;
      },
    },
    onSubmit: async ({ formApi, value }) => {
      try {
        await onSubmit(value);
        onClose();
      } catch (error) {
        formApi.setErrorMap({
          onSubmit: error instanceof Error ? error.message : t("resetPasswordFailed"),
        });
        throw error;
      }
    },
  });

  useEffect(() => {
    if (!open) {
      form.reset({
        newPassword: "",
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
          <DialogTitle>{t("resetPasswordDialogTitle", { ns: "users" })}</DialogTitle>
          <DialogDescription>
            {t("resetPasswordDialogDescription", { ns: "users", username })}
          </DialogDescription>
        </DialogHeader>
        <form className="flex flex-col gap-4" onSubmit={handleSubmit}>
          <FieldGroup>
            <form.Field name="newPassword">
              {(field) => (
                <Field>
                  <FieldLabel htmlFor="reset-user-password">
                    {t("newPasswordLabel", { ns: "auth" })}
                  </FieldLabel>
                  <Input
                    aria-label={t("newPasswordLabel", { ns: "auth" })}
                    autoComplete="new-password"
                    className="h-10 rounded-xl border-border/80 bg-background/80"
                    id="reset-user-password"
                    onChange={(event) => {
                      form.setErrorMap({ onSubmit: undefined });
                      field.handleChange(event.target.value);
                    }}
                    type="password"
                    value={field.state.value}
                  />
                </Field>
              )}
            </form.Field>
          </FieldGroup>
          <form.Subscribe selector={(state) => state.errors}>
            {(errors) => {
              const errorMessage = getFirstFormError(errors);
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
                    {t("cancelAction", { ns: "users" })}
                  </Button>
                  <Button disabled={isSubmitting} size="lg" type="submit">
                    {isSubmitting
                      ? t("resetPasswordPendingAction", { ns: "users" })
                      : t("confirmResetPasswordAction", { ns: "users" })}
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
