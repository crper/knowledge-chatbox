import { useEffect, useRef, useState } from "react";
import { useForm, revalidateLogic } from "@tanstack/react-form";
import { useTranslation } from "react-i18next";

import { Button } from "@/components/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Form } from "@/components/ui/form";
import { getFirstFormError } from "@/lib/forms";
import { providerSettingsSchema } from "@/lib/validation/schemas";
import type { AppSettings, ProviderConnectionResult } from "../api/settings";
import {
  buildProviderSettingsView,
  type ProviderSettingsFieldName,
  type ProviderSettingsView,
  toSettingsPayload,
} from "./provider-form-state";
import { validateProviderSettings } from "./provider-form-validation";
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

export type FormNotice = {
  items?: Array<{ label: string; message: string; healthy: boolean }>;
  message: string;
  title: string;
  variant?: "default" | "destructive";
};

const ADVANCED_FIELD_NAMES: ProviderSettingsFieldName[] = [
  "retrievalEmbeddingModel",
  "providerTimeoutSeconds",
];

const PROVIDER_FIELD_ORDER: ProviderSettingsFieldName[] = [
  "chatModel",
  "embeddingModel",
  "visionModel",
  "primaryBaseUrl",
  "retrievalEmbeddingModel",
  "providerTimeoutSeconds",
];

function getFirstInvalidField(
  fields?: Partial<Record<ProviderSettingsFieldName, unknown>>,
): ProviderSettingsFieldName | null {
  if (!fields) return null;
  return PROVIDER_FIELD_ORDER.find((field) => fields[field] !== undefined) ?? null;
}

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
  const fieldRefs = useRef<Partial<Record<ProviderSettingsFieldName, HTMLElement | null>>>({});
  const chatModelLabel = t("chatModelLabel");
  const embeddingModelLabel = t("embeddingModelLabel");
  const visionModelLabel = t("visionModelLabel");
  const retrievalEmbeddingModelLabel = t("retrievalEmbeddingModelLabel");

  const form = useForm({
    defaultValues: buildProviderSettingsView(initialValues),
    validators: {
      onChange: ({ value }) => validateProviderSettings(value),
    },
    validationLogic: revalidateLogic({ mode: "submit", modeAfterSubmission: "blur" }),
    onSubmit: async ({ formApi, value }) => {
      try {
        const result = await onSave(toSettingsPayload(value));
        const nextDraft = buildProviderSettingsView(result);
        form.reset(nextDraft);
        formApi.setErrorMap({ onChange: undefined, onSubmit: undefined });
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
  });

  useEffect(() => {
    const nextDraft = buildProviderSettingsView(initialValues);
    form.reset(nextDraft);
    form.setErrorMap({ onChange: undefined, onSubmit: undefined });
    setAdvancedOpen(false);
    setNotice(null);
    setPendingScrollField(null);
  }, [form, initialValues]);

  const clearFeedback = () => {
    setNotice(null);
    form.setErrorMap({ onChange: undefined, onSubmit: undefined });
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

  const handleSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    event.stopPropagation();
    clearFeedback();
    void form.handleSubmit().then(() => {
      const onChangeError = form.state.errorMap.onChange;
      if (onChangeError && typeof onChangeError === "object" && "fields" in onChangeError) {
        const firstInvalid = getFirstInvalidField(
          (onChangeError as { fields: Partial<Record<ProviderSettingsFieldName, unknown>> }).fields,
        );
        if (firstInvalid) {
          scrollToField(firstInvalid);
        }
      }
    });
  };

  const handleTest = async () => {
    clearFeedback();

    const currentValues = form.state.values;
    const result = providerSettingsSchema.safeParse(currentValues);
    if (!result.success) {
      const onChangeError = form.state.errorMap.onChange;
      if (onChangeError && typeof onChangeError === "object" && "fields" in onChangeError) {
        const firstInvalid = getFirstInvalidField(
          (onChangeError as { fields: Partial<Record<ProviderSettingsFieldName, unknown>> }).fields,
        );
        if (firstInvalid) {
          scrollToField(firstInvalid);
        }
      }
      return;
    }

    try {
      const testResult = await onTestProvider(toSettingsPayload(currentValues));
      const allHealthy =
        testResult.response.healthy && testResult.embedding.healthy && testResult.vision.healthy;
      const ollamaBaseUrl = currentValues.providerProfiles.ollama.base_url;
      const items = [
        {
          healthy: testResult.response.healthy,
          label: t("statusChatLabel"),
          message: getCapabilityHealthMessage(testResult.response, t, ollamaBaseUrl),
        },
        {
          healthy: testResult.embedding.healthy,
          label: t("statusRetrievalLabel"),
          message: getCapabilityHealthMessage(testResult.embedding, t, ollamaBaseUrl),
        },
        {
          healthy: testResult.vision.healthy,
          label: t("statusVisionLabel"),
          message: getCapabilityHealthMessage(testResult.vision, t, ollamaBaseUrl),
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
          const onChangeFields =
            errorMap.onChange &&
            typeof errorMap.onChange === "object" &&
            "fields" in errorMap.onChange
              ? (
                  errorMap.onChange as {
                    fields: Partial<Record<ProviderSettingsFieldName, string>>;
                  }
                ).fields
              : undefined;
          const fieldErrorMessages: Record<string, string | undefined> = {
            chatModel: onChangeFields?.chatModel ? t(onChangeFields.chatModel) : undefined,
            embeddingModel: onChangeFields?.embeddingModel
              ? t(onChangeFields.embeddingModel)
              : undefined,
            visionModel: onChangeFields?.visionModel ? t(onChangeFields.visionModel) : undefined,
            primaryBaseUrl: onChangeFields?.primaryBaseUrl
              ? t(onChangeFields.primaryBaseUrl)
              : undefined,
            providerTimeoutSeconds: onChangeFields?.providerTimeoutSeconds
              ? t(onChangeFields.providerTimeoutSeconds)
              : undefined,
            retrievalEmbeddingModel: onChangeFields?.retrievalEmbeddingModel
              ? t(onChangeFields.retrievalEmbeddingModel)
              : undefined,
          };
          const firstFieldErrorMessage =
            fieldErrorMessages.chatModel ??
            fieldErrorMessages.embeddingModel ??
            fieldErrorMessages.visionModel ??
            fieldErrorMessages.primaryBaseUrl ??
            fieldErrorMessages.retrievalEmbeddingModel ??
            fieldErrorMessages.providerTimeoutSeconds;
          const errorMessage =
            getFirstFormError(errorMap.onSubmit ?? errorMap.onChange, t) || firstFieldErrorMessage;

          return (
            <>
              <ProviderStatusSummary initialValues={initialValues} t={t} />

              <PrimaryProviderSection
                chatModelLabel={chatModelLabel}
                draft={draft}
                embeddingModelLabel={embeddingModelLabel}
                fieldErrorMessages={{
                  chatModel: fieldErrorMessages.chatModel,
                  embeddingModel: fieldErrorMessages.embeddingModel,
                  primaryBaseUrl: fieldErrorMessages.primaryBaseUrl,
                  visionModel: fieldErrorMessages.visionModel,
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
                        retrievalEmbeddingModel: fieldErrorMessages.retrievalEmbeddingModel,
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
                        providerTimeoutSeconds: fieldErrorMessages.providerTimeoutSeconds,
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
