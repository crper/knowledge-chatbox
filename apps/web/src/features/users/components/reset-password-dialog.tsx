import { useEffect } from "react";
import { useForm, revalidateLogic } from "@tanstack/react-form";
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
import { Form } from "@/components/ui/form";
import { FormTextField } from "@/lib/form/form-fields";
import { FormErrorAlert } from "@/lib/form/form-feedback";
import { getFirstFormError, zodFieldErrors } from "@/lib/forms";
import { getErrorMessage } from "@/lib/utils";
import { resetPasswordSchema } from "@/lib/validation/schemas";

type ResetPasswordDialogProps = {
  open: boolean;
  username: string;
  onClose: () => void;
  onSubmit: (input: { newPassword: string }) => Promise<void>;
};

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
      onChange: ({ value }) =>
        zodFieldErrors(
          resetPasswordSchema,
          value as Record<string, unknown>,
          "users:resetPasswordValidationError",
        ),
    },
    validationLogic: revalidateLogic({ mode: "submit", modeAfterSubmission: "blur" }),
    onSubmit: async ({ formApi, value }) => {
      try {
        await onSubmit(value);
        onClose();
      } catch (error) {
        formApi.setErrorMap({
          onSubmit: {
            fields: {},
            form: getErrorMessage(error, t("resetPasswordFailed")),
          },
        });
        throw error;
      }
    },
  });

  useEffect(() => {
    if (!open) {
      form.reset({ newPassword: "" });
      form.setErrorMap({ onSubmit: undefined });
    }
  }, [form, open]);

  return (
    <Dialog onOpenChange={(nextOpen) => !nextOpen && onClose()} open={open}>
      <DialogContent className="sm:max-w-md" closeLabel={t("closeAction", { ns: "common" })}>
        <DialogHeader>
          <DialogTitle>{t("resetPasswordDialogTitle", { ns: "users" })}</DialogTitle>
          <DialogDescription>
            {t("resetPasswordDialogDescription", { ns: "users", username })}
          </DialogDescription>
        </DialogHeader>
        <Form
          className="flex flex-col gap-4"
          onSubmit={(e) => {
            e.preventDefault();
            e.stopPropagation();
            void form.handleSubmit();
          }}
        >
          <FormTextField
            autoComplete="new-password"
            className="h-10 rounded-xl border-border/80 bg-background/80"
            form={form}
            id="reset-user-password"
            label={t("newPasswordLabel", { ns: "auth" })}
            name="newPassword"
            onChange={() => form.setErrorMap({ onSubmit: undefined })}
            t={t}
            type="password"
          />
          <form.Subscribe selector={(state) => state.errorMap}>
            {(errorMap) => {
              const errorMessage = getFirstFormError(errorMap.onSubmit ?? errorMap.onChange, t);

              return <FormErrorAlert message={errorMessage} />;
            }}
          </form.Subscribe>
          <DialogFooter>
            <form.Subscribe selector={(state) => [state.canSubmit, state.isSubmitting] as const}>
              {([canSubmit, isSubmitting]) => (
                <>
                  <Button
                    disabled={!canSubmit}
                    onClick={onClose}
                    size="lg"
                    type="button"
                    variant="ghost"
                  >
                    {t("cancelAction", { ns: "users" })}
                  </Button>
                  <Button disabled={!canSubmit} size="lg" type="submit">
                    {isSubmitting
                      ? t("resetPasswordPendingAction", { ns: "users" })
                      : t("confirmResetPasswordAction", { ns: "users" })}
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
