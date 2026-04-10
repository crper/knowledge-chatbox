/**
 * @file 用户相关界面组件模块。
 */

import { useEffect } from "react";
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
import { FormErrorAlert, getFieldErrorItems, getFormErrorMessage } from "@/lib/form/form-feedback";
import { useAppForm } from "@/lib/form/use-app-form";
import { handleFormSubmitEvent } from "@/lib/forms";
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

/**
 * 渲染创建用户对话框。
 */
export function CreateUserDialog({ open, onClose, onSubmit }: CreateUserDialogProps) {
  const { t } = useTranslation(["users", "common"]);
  const form = useAppForm({
    defaultValues: {
      password: "",
      role: "user" as const,
      username: "",
    },
    formI18nKey: "users:createUserValidationError",
    onSubmit: async ({ formApi, value }) => {
      try {
        await onSubmit({ password: value.password, role: "user", username: value.username.trim() });
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
    schema: createUserSchema,
  });

  useEffect(() => {
    if (!open) {
      form.reset({
        password: "",
        role: "user",
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
        <Form className="flex flex-col gap-4" onSubmit={handleSubmit}>
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
                  <FieldError errors={getFieldErrorItems(field.state.meta.errors, t)} />
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
                  <FieldError errors={getFieldErrorItems(field.state.meta.errors, t)} />
                </Field>
              )}
            </form.Field>
          </FieldGroup>
          <form.Subscribe selector={(state) => state.errorMap}>
            {(errorMap) => {
              const errorMessage = getFormErrorMessage([errorMap.onDynamic, errorMap.onSubmit], t);

              return <FormErrorAlert message={errorMessage} />;
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
        </Form>
      </DialogContent>
    </Dialog>
  );
}
