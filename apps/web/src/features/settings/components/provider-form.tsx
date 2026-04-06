/**
 * @file 设置相关界面组件模块。
 */

import { useEffect, useRef, useState } from "react";
import type { FormEvent } from "react";
import { useTranslation } from "react-i18next";

import { Button } from "@/components/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Form } from "@/components/ui/form";
import { getFormErrorMessage } from "@/lib/form/form-feedback";
import { useAppForm } from "@/lib/form/use-app-form";
import { handleFormSubmitEvent } from "@/lib/forms";
import type { AppSettings, ProviderConnectionResult } from "../api/settings";
import {
  buildProviderSettingsView,
  type ProviderSettingsFieldName,
  type ProviderSettingsView,
  toSettingsPayload,
} from "./provider-form-state";
import {
  getFirstInvalidProviderField,
  validateProviderSettingsForm,
} from "./provider-form.validation";
import { PrimaryProviderSection } from "./primary-provider-section";
import { ProviderStatusSummary } from "./provider-status-summary";
import { getCapabilityHealthMessage } from "./provider-form-shared";
import { SettingsActionBar } from "./provider-form-sections";
import { ProviderTimeoutSection } from "./provider-timeout-section";
import { RetrievalOverrideSection } from "./retrieval-override-section";
import { TemplateEditorSection } from "./template-editor-section";

type ProviderFormProps = {
  initialValues: AppSettings;
  savePending?: boolean;
  testPending?: boolean;
  onSave: (values: Partial<AppSettings>) => Promise<AppSettings>;
  onTestProvider: (values: Partial<AppSettings>) => Promise<ProviderConnectionResult>;
};

type FormNotice = {
  items?: Array<{ label: string; message: string; healthy: boolean }>;
  message: string;
  title: string;
  variant?: "default" | "destructive";
};

const ADVANCED_FIELD_NAMES: ProviderSettingsFieldName[] = [
  "retrievalEmbeddingModel",
  "providerTimeoutSeconds",
];

/**
 * 渲染 Provider 设置表单。
 */
export function ProviderForm({
  initialValues,
  savePending = false,
  testPending = false,
  onSave,
  onTestProvider,
}: ProviderFormProps) {
  const { t } = useTranslation("settings");
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [notice, setNotice] = useState<FormNotice | null>(null);
  const [pendingScrollField, setPendingScrollField] = useState<ProviderSettingsFieldName | null>(
    null,
  );
  const [validationResult, setValidationResult] = useState<ReturnType<
    typeof validateProviderSettingsForm
  > | null>(null);
  const fieldRefs = useRef<Partial<Record<ProviderSettingsFieldName, HTMLElement | null>>>({});
  const chatModelLabel = t("chatModelLabel");
  const embeddingModelLabel = t("embeddingModelLabel");
  const visionModelLabel = t("visionModelLabel");
  const retrievalEmbeddingModelLabel = t("retrievalEmbeddingModelLabel");

  const form = useAppForm<ProviderSettingsView, ProviderSettingsFieldName>({
    defaultValues: buildProviderSettingsView(initialValues),
    onSubmit: async ({ formApi, value }) => {
      try {
        const result = await onSave(toSettingsPayload(value));
        const nextDraft = buildProviderSettingsView(result);
        form.reset(nextDraft);
        formApi.setErrorMap({ onDynamic: undefined, onSubmit: undefined });
        setAdvancedOpen(false);
        setNotice({
          title: t("saveNoticeTitle"),
          message: result.rebuild_started
            ? t("backgroundRebuildStartedNotice")
            : result.index_rebuild_status === "running"
              ? t("backgroundRebuildRunningNotice")
              : t("saveSuccessNotice"),
        });
      } catch (error) {
        formApi.setErrorMap({
          onSubmit: {
            fields: {},
            form: error instanceof Error ? error.message : t("saveFailedNotice"),
          },
        });
        throw error;
      }
    },
    validator: validateProviderSettingsForm,
  });

  useEffect(() => {
    const nextDraft = buildProviderSettingsView(initialValues);
    form.reset(nextDraft);
    form.setErrorMap({ onDynamic: undefined, onSubmit: undefined });
    setAdvancedOpen(false);
    setNotice(null);
    setPendingScrollField(null);
    setValidationResult(null);
  }, [form, initialValues]);

  const clearFeedback = () => {
    setNotice(null);
    setValidationResult(null);
    form.setErrorMap({ onDynamic: undefined, onSubmit: undefined });
  };

  const scrollToField = (field: ProviderSettingsFieldName) => {
    if (ADVANCED_FIELD_NAMES.includes(field) && !advancedOpen) {
      setAdvancedOpen(true);
      setPendingScrollField(field);
      return;
    }

    const target = fieldRefs.current[field];
    target?.scrollIntoView?.({ block: "center", behavior: "smooth" });
  };

  useEffect(() => {
    if (!pendingScrollField) {
      return;
    }

    const target = fieldRefs.current[pendingScrollField];
    if (!target) {
      return;
    }

    const frame = window.requestAnimationFrame(() => {
      target.scrollIntoView?.({ block: "center", behavior: "smooth" });
      setPendingScrollField(null);
    });

    return () => window.cancelAnimationFrame(frame);
  }, [advancedOpen, pendingScrollField]);

  const handleViewChange = (updater: (current: ProviderSettingsView) => ProviderSettingsView) => {
    clearFeedback();
    const nextValues = updater(form.state.values);

    form.setFieldValue("primaryProvider", nextValues.primaryProvider);
    form.setFieldValue("providerProfiles", nextValues.providerProfiles);
    form.setFieldValue("providerTimeoutSeconds", nextValues.providerTimeoutSeconds);
    form.setFieldValue("retrievalOverrideEnabled", nextValues.retrievalOverrideEnabled);
    form.setFieldValue("retrievalProvider", nextValues.retrievalProvider);
    form.setFieldValue("templateProvider", nextValues.templateProvider);
  };

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    clearFeedback();
    const currentValues = form.state.values;
    const validation = validateProviderSettingsForm(currentValues);
    if (validation) {
      setValidationResult(validation);
      const firstInvalidField = getFirstInvalidProviderField(currentValues);
      if (firstInvalidField) {
        scrollToField(firstInvalidField);
      }
      event.preventDefault();
      return;
    }

    void handleFormSubmitEvent(event, () => form.handleSubmit());
  };

  const handleTest = async () => {
    clearFeedback();

    const currentValues = form.state.values;
    const validation = validateProviderSettingsForm(currentValues);
    if (validation) {
      setValidationResult(validation);
      const firstInvalidField = getFirstInvalidProviderField(currentValues);
      if (firstInvalidField) {
        scrollToField(firstInvalidField);
      }
      return;
    }

    try {
      const result = await onTestProvider(toSettingsPayload(currentValues));
      const allHealthy =
        result.response.healthy && result.embedding.healthy && result.vision.healthy;
      const ollamaBaseUrl = currentValues.providerProfiles.ollama.base_url;
      const items = [
        {
          healthy: result.response.healthy,
          label: t("statusChatLabel"),
          message: getCapabilityHealthMessage(result.response, t, ollamaBaseUrl),
        },
        {
          healthy: result.embedding.healthy,
          label: t("statusRetrievalLabel"),
          message: getCapabilityHealthMessage(result.embedding, t, ollamaBaseUrl),
        },
        {
          healthy: result.vision.healthy,
          label: t("statusVisionLabel"),
          message: getCapabilityHealthMessage(result.vision, t, ollamaBaseUrl),
        },
      ];
      setNotice({
        title: allHealthy ? t("connectionSuccessNotice") : t("testConnectionFailedNotice"),
        items,
        message: allHealthy
          ? t("connectionSuccessNotice")
          : t("testConnectionPartialNotice", { count: items.length }),
        variant: allHealthy ? "default" : "destructive",
      });
    } catch (error) {
      form.setErrorMap({
        onSubmit: {
          fields: {},
          form: error instanceof Error ? error.message : t("testConnectionFailedNotice"),
        },
      });
    }
  };

  return (
    <Form className="flex flex-col gap-6" noValidate onSubmit={handleSubmit}>
      <form.Subscribe selector={(state) => ({ draft: state.values, errorMap: state.errorMap })}>
        {({ draft, errorMap }) => {
          const fieldErrorMessages = {
            chatModel: getFormErrorMessage([validationResult?.fields?.chatModel], t),
            embeddingModel: getFormErrorMessage([validationResult?.fields?.embeddingModel], t),
            primaryBaseUrl: getFormErrorMessage([validationResult?.fields?.primaryBaseUrl], t),
            providerTimeoutSeconds: getFormErrorMessage(
              [validationResult?.fields?.providerTimeoutSeconds],
              t,
            ),
            retrievalEmbeddingModel: getFormErrorMessage(
              [validationResult?.fields?.retrievalEmbeddingModel],
              t,
            ),
            visionModel: getFormErrorMessage([validationResult?.fields?.visionModel], t),
          };
          const errorMessage = getFormErrorMessage([validationResult?.form, errorMap.onSubmit], t);

          return (
            <>
              <ProviderStatusSummary initialValues={initialValues} t={t} />

              <PrimaryProviderSection
                chatModelLabel={chatModelLabel}
                draft={draft}
                embeddingModelLabel={embeddingModelLabel}
                fieldErrorMessages={{
                  chatModel: fieldErrorMessages.chatModel ?? undefined,
                  embeddingModel: fieldErrorMessages.embeddingModel ?? undefined,
                  primaryBaseUrl: fieldErrorMessages.primaryBaseUrl ?? undefined,
                  visionModel: fieldErrorMessages.visionModel ?? undefined,
                }}
                fieldRefs={fieldRefs}
                handleViewChange={handleViewChange}
                t={t}
                visionModelLabel={visionModelLabel}
              />

              <Collapsible open={advancedOpen} onOpenChange={setAdvancedOpen}>
                <section className="rounded-2xl border border-border/60 bg-background/55 px-5 py-5">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <h2 className="text-sm font-medium">{t("advancedSettingsTitle")}</h2>
                    </div>
                    <CollapsibleTrigger
                      render={
                        <Button
                          aria-expanded={advancedOpen}
                          size="sm"
                          type="button"
                          variant={advancedOpen ? "secondary" : "outline"}
                        />
                      }
                    >
                      {advancedOpen
                        ? t("advancedSettingsCloseAction")
                        : t("advancedSettingsOpenAction")}
                    </CollapsibleTrigger>
                  </div>

                  <CollapsibleContent className="mt-5 space-y-5">
                    <RetrievalOverrideSection
                      draft={draft}
                      fieldErrorMessages={{
                        retrievalEmbeddingModel:
                          fieldErrorMessages.retrievalEmbeddingModel ?? undefined,
                      }}
                      fieldRefs={fieldRefs}
                      handleViewChange={handleViewChange}
                      retrievalEmbeddingModelLabel={retrievalEmbeddingModelLabel}
                      t={t}
                    />

                    <TemplateEditorSection
                      draft={draft}
                      handleViewChange={handleViewChange}
                      t={t}
                    />

                    <ProviderTimeoutSection
                      draft={draft}
                      fieldErrorMessages={{
                        providerTimeoutSeconds:
                          fieldErrorMessages.providerTimeoutSeconds ?? undefined,
                      }}
                      fieldRefs={fieldRefs}
                      handleViewChange={handleViewChange}
                      t={t}
                    />
                  </CollapsibleContent>
                </section>
              </Collapsible>

              <SettingsActionBar
                errorMessage={errorMessage}
                notice={notice}
                onTest={() => {
                  void handleTest();
                }}
                savePending={savePending}
                t={t}
                testPending={testPending}
              />
            </>
          );
        }}
      </form.Subscribe>
    </Form>
  );
}
