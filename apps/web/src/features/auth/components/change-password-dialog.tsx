import { useEffect, useState } from "react";
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
import { ApiRequestError, getApiErrorMessage } from "@/lib/api/client";
import { FormTextField } from "@/lib/form/form-fields";
import { FormErrorAlert } from "@/lib/form/form-feedback";
import { getFirstFormError, zodFieldErrors } from "@/lib/forms";
import { changePasswordSchema } from "@/lib/validation/schemas";

type ChangePasswordDialogProps = {
  open: boolean;
  onClose: () => void;
  onSubmit: (input: { currentPassword: string; newPassword: string }) => Promise<void>;
};

export function ChangePasswordDialog({ open, onClose, onSubmit }: ChangePasswordDialogProps) {
  const { t } = useTranslation(["auth", "common"]);
  const [submitError, setSubmitError] = useState<unknown>(null);
  const onChangeValidate = ({ value }: { value: Record<string, unknown> }) =>
    zodFieldErrors(changePasswordSchema, value, "auth:changePasswordValidationError");
  const form = useForm({
    defaultValues: {
      currentPassword: "",
      newPassword: "",
    },
    validators: {
      onBlur: onChangeValidate,
      onSubmit: onChangeValidate,
    },
    validationLogic: revalidateLogic({ mode: "submit", modeAfterSubmission: "blur" }),
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
  });

  useEffect(() => {
    if (!open) {
      form.reset({ currentPassword: "", newPassword: "" });
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

  return (
    <Dialog onOpenChange={(nextOpen) => !nextOpen && onClose()} open={open}>
      <DialogContent className="sm:max-w-md" closeLabel={t("closeAction", { ns: "common" })}>
        <DialogHeader>
          <DialogTitle>{t("changePasswordTitle")}</DialogTitle>
          <DialogDescription>{t("changePasswordDescription")}</DialogDescription>
        </DialogHeader>
        <Form
          className="flex flex-col gap-4"
          onSubmit={(e) => {
            e.preventDefault();
            void form.handleSubmit().catch(() => {});
          }}
        >
          <FormTextField
            autoComplete="current-password"
            className="h-10 rounded-xl border-border/80 bg-background/80"
            form={form}
            id="current-password"
            label={t("currentPasswordLabel")}
            name="currentPassword"
            onChange={() => setSubmitError(null)}
            t={t}
            type="password"
          />
          <FormTextField
            autoComplete="new-password"
            className="h-10 rounded-xl border-border/80 bg-background/80"
            form={form}
            id="new-password"
            label={t("newPasswordLabel")}
            name="newPassword"
            onChange={() => setSubmitError(null)}
            t={t}
            type="password"
          />
          <form.Subscribe selector={(state) => state.errorMap.onSubmit}>
            {(onSubmitError) => {
              const formErrorMessage = getFirstFormError(onSubmitError, t);
              const submitErrorMessage = getSubmitErrorMessage();
              const displayError = formErrorMessage || submitErrorMessage;
              return <FormErrorAlert message={displayError} />;
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
                    {t("cancelAction")}
                  </Button>
                  <Button disabled={!canSubmit} size="lg" type="submit">
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
