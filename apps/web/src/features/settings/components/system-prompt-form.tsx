/**
 * @file 系统提示词表单模块。
 */

import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import { useTranslation } from "react-i18next";

import type { AppSettings } from "../api/settings";
import type { FormNotice } from "./provider-form";
import { SettingsActionBar, SystemPromptSection } from "./provider-form-sections";
import { Form } from "@/components/ui/form";
import { getFormErrorMessage } from "@/lib/form/form-feedback";
import { useAppForm } from "@/lib/form/use-app-form";
import { handleFormSubmitEvent } from "@/lib/forms";
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
  const form = useAppForm({
    defaultValues: {
      system_prompt: initialValues.system_prompt ?? "",
    },
    onSubmit: async ({ value }) => {
      try {
        await onSave({
          system_prompt: value.system_prompt,
        });
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
    schema: systemPromptSchema,
  });

  useEffect(() => {
    form.reset({
      system_prompt: initialValues.system_prompt ?? "",
    });
    form.setErrorMap({ onSubmit: undefined });
  }, [form, initialValues]);

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    setNotice(null);
    void handleFormSubmitEvent(event, () => form.handleSubmit());
  };

  return (
    <Form className="flex flex-col gap-6" noValidate onSubmit={handleSubmit}>
      <SystemPromptSection form={form} onValueChange={() => setNotice(null)} t={t} />
      <form.Subscribe selector={(state) => state.errors}>
        {(errors) => (
          <SettingsActionBar
            errorMessage={getFormErrorMessage(errors, t)}
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
