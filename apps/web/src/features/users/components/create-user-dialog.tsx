/**
 * @file 用户相关界面组件模块。
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
    validators: {
      onSubmit: ({ value }) => {
        if (!value.username.trim() || !value.password) {
          return t("createUserValidationError");
        }

        if (value.password.length < 8) {
          return t("passwordLengthValidationError");
        }

        return undefined;
      },
    },
    onSubmit: async ({ formApi, value }) => {
      try {
        await onSubmit({ password: value.password, role: "user", username: value.username.trim() });
        onClose();
      } catch (error) {
        formApi.setErrorMap({
          onSubmit: error instanceof Error ? error.message : t("createUserFailed"),
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
                    autoComplete="username"
                    className="h-10 rounded-xl border-border/80 bg-background/80"
                    id="create-user-username"
                    onChange={(event) => {
                      form.setErrorMap({ onSubmit: undefined });
                      field.handleChange(event.target.value);
                    }}
                    value={field.state.value}
                  />
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
                    autoComplete="new-password"
                    className="h-10 rounded-xl border-border/80 bg-background/80"
                    id="create-user-password"
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
