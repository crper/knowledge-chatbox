import { useEffect, useState } from "react";
import { useForm, revalidateLogic } from "@tanstack/react-form";
import { useTranslation } from "react-i18next";

import type { AppSettings } from "../api/settings";
import type { FormNotice } from "./provider-form";
import { SettingsActionBar, SystemPromptSection } from "./provider-form-sections";
import { Form } from "@/components/ui/form";
import { getFirstFormError, zodFieldErrors } from "@/lib/forms";
import { getErrorMessage } from "@/lib/utils";
import { systemPromptSchema } from "@/lib/validation/schemas";

type SystemPromptFormProps = {
  initialValues: AppSettings;
  savePending?: boolean;
  onSave: (values: Partial<AppSettings>) => Promise<AppSettings>;
};

export function SystemPromptForm({
  initialValues,
  onSave,
  savePending = false,
}: SystemPromptFormProps) {
  const { t } = useTranslation("settings");
  const [notice, setNotice] = useState<FormNotice | null>(null);
  const form = useForm({
    defaultValues: {
      system_prompt: initialValues.system_prompt ?? "",
    },
    validators: {
      onChange: ({ value }) => zodFieldErrors(systemPromptSchema, value as Record<string, unknown>),
    },
    validationLogic: revalidateLogic({ mode: "submit", modeAfterSubmission: "blur" }),
    onSubmit: async ({ value }) => {
      try {
        await onSave({ system_prompt: value.system_prompt });
        setNotice({
          message: t("saveSuccessNotice"),
          title: t("saveNoticeTitle"),
        });
      } catch (error) {
        setNotice({
          message: getErrorMessage(error, t("saveFailedNotice")),
          title: t("saveNoticeTitle"),
          variant: "destructive",
        });
      }
    },
  });

  useEffect(() => {
    form.reset({ system_prompt: initialValues.system_prompt ?? "" });
    form.setErrorMap({ onSubmit: undefined });
  }, [form, initialValues]);

  return (
    <Form
      className="flex flex-col gap-6"
      noValidate
      onSubmit={(e) => {
        e.preventDefault();
        e.stopPropagation();
        setNotice(null);
        void form.handleSubmit();
      }}
    >
      <SystemPromptSection form={form} onValueChange={() => setNotice(null)} t={t} />
      <form.Subscribe selector={(state) => state.errors}>
        {(errors) => (
          <SettingsActionBar
            errorMessage={getFirstFormError(errors[0], t)}
            notice={notice}
            onTest={() => {}}
            savePending={savePending}
            showTestAction={false}
            t={t}
          />
        )}
      </form.Subscribe>
    </Form>
  );
}
