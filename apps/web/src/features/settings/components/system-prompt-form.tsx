/**
 * @file 系统提示词表单模块。
 */

import { useEffect, useState } from "react";
import { useForm } from "@tanstack/react-form";
import type { FormEvent } from "react";
import { useTranslation } from "react-i18next";

import type { AppSettings } from "../api/settings";
import { SettingsActionBar, SystemPromptSection } from "./provider-form-sections";
import { getFirstFormError, handleFormSubmitEvent } from "@/lib/forms";

type SystemPromptFormProps = {
  initialValues: AppSettings;
  savePending?: boolean;
  onSave: (values: Partial<AppSettings>) => Promise<AppSettings>;
};

type FormNotice = {
  message: string;
  title: string;
  variant?: "default" | "destructive";
};

function toErrorMessage(error: unknown, fallbackMessage: string) {
  return error instanceof Error ? error.message : fallbackMessage;
}

/**
 * 渲染系统提示词表单。
 */
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
          message: toErrorMessage(error, t("saveFailedNotice")),
          title: t("saveNoticeTitle"),
          variant: "destructive",
        });
        throw error;
      }
    },
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
    <form className="flex flex-col gap-6" noValidate onSubmit={handleSubmit}>
      <SystemPromptSection form={form} onValueChange={() => setNotice(null)} t={t} />
      <form.Subscribe selector={(state) => state.errors}>
        {(errors) => (
          <SettingsActionBar
            errorMessage={getFirstFormError(errors, t)}
            notice={notice}
            onTest={() => {}}
            savePending={savePending}
            showTestAction={false}
            t={t}
          />
        )}
      </form.Subscribe>
    </form>
  );
}
