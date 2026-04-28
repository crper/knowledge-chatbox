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
import { createUserSchema } from "@/lib/validation/schemas";

type CreateUserDialogProps = {
  open: boolean;
  onClose: () => void;
  onSubmit: (input: {
    username: string;
    password: string;
    role: "admin" | "user";
  }) => Promise<void>;
};

export function CreateUserDialog({ open, onClose, onSubmit }: CreateUserDialogProps) {
  const { t } = useTranslation(["users", "common"]);
  const form = useForm({
    defaultValues: {
      password: "",
      role: "user" as const,
      username: "",
    },
    validators: {
      onChange: ({ value }) =>
        zodFieldErrors(
          createUserSchema,
          value as Record<string, unknown>,
          "users:createUserValidationError",
        ),
    },
    validationLogic: revalidateLogic({ mode: "submit", modeAfterSubmission: "blur" }),
    onSubmit: async ({ formApi, value }) => {
      try {
        await onSubmit({
          password: value.password,
          role: value.role,
          username: value.username.trim(),
        });
        onClose();
      } catch (error) {
        formApi.setErrorMap({
          onSubmit: {
            fields: {},
            form: getErrorMessage(error, t("createUserFailed")),
          },
        });
        throw error;
      }
    },
  });

  useEffect(() => {
    if (!open) {
      form.reset({ password: "", role: "user", username: "" });
      form.setErrorMap({ onSubmit: undefined });
    }
  }, [form, open]);

  return (
    <Dialog onOpenChange={(nextOpen) => !nextOpen && onClose()} open={open}>
      <DialogContent className="sm:max-w-md" closeLabel={t("closeAction", { ns: "common" })}>
        <DialogHeader>
          <DialogTitle>{t("createUserTitle")}</DialogTitle>
          <DialogDescription>{t("createUserDescription")}</DialogDescription>
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
            autoComplete="username"
            className="h-10 rounded-xl border-border/80 bg-background/80"
            form={form}
            id="create-user-username"
            label={t("newUsernameLabel")}
            name="username"
            onChange={() => form.setErrorMap({ onSubmit: undefined })}
            t={t}
          />
          <FormTextField
            autoComplete="new-password"
            className="h-10 rounded-xl border-border/80 bg-background/80"
            form={form}
            id="create-user-password"
            label={t("initialPasswordLabel")}
            name="password"
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
                    {t("cancelAction")}
                  </Button>
                  <Button disabled={!canSubmit} size="lg" type="submit">
                    {isSubmitting ? t("submitCreatePendingAction") : t("submitCreateAction")}
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
