/**
 * @file 设置相关界面组件模块。
 */

import { useEffect, useRef, useState } from "react";
import type { FormEvent } from "react";
import { useTranslation } from "react-i18next";

import { Button } from "@/components/ui/button";
import type { AppSettings, ProviderConnectionResult } from "../api/settings";
import {
  buildProviderSettingsView,
  type ProviderSettingsFieldName,
  type ProviderSettingsValidationResult,
  type ProviderSettingsView,
  toSettingsPayload,
  validateProviderSettingsView,
} from "./provider-form-state";
import { PrimaryProviderSection } from "./primary-provider-section";
import { ProviderStatusSummary } from "./provider-status-summary";
import { getCapabilityHealthMessage } from "./provider-form-shared";
import { SettingsActionBar } from "./provider-form-sections";
import { ProviderTimeoutSection } from "./provider-timeout-section";
import { RetrievalOverrideSection } from "./retrieval-override-section";
import { TemplateEditorSection } from "./template-editor-section";
import { getFirstFormError } from "@/lib/forms";

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
  const [draft, setDraft] = useState<ProviderSettingsView>(() =>
    buildProviderSettingsView(initialValues),
  );
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [notice, setNotice] = useState<FormNotice | null>(null);
  const [validationResult, setValidationResult] = useState<ProviderSettingsValidationResult | null>(
    null,
  );
  const [pendingScrollField, setPendingScrollField] = useState<ProviderSettingsFieldName | null>(
    null,
  );
  const fieldRefs = useRef<Partial<Record<ProviderSettingsFieldName, HTMLInputElement | null>>>({});
  const chatModelLabel = t("chatModelLabel");
  const embeddingModelLabel = t("embeddingModelLabel");
  const visionModelLabel = t("visionModelLabel");
  const retrievalEmbeddingModelLabel = t("retrievalEmbeddingModelLabel");

  useEffect(() => {
    const nextDraft = buildProviderSettingsView(initialValues);
    setDraft(nextDraft);
    setAdvancedOpen(false);
    setErrorMessage(null);
    setNotice(null);
    setValidationResult(null);
    setPendingScrollField(null);
  }, [initialValues]);

  const ollamaBaseUrl = draft.providerProfiles.ollama.base_url;

  const clearFeedback = () => {
    setErrorMessage(null);
    setNotice(null);
    setValidationResult(null);
  };

  const fieldErrorMessages = {
    chatModel: getFirstFormError([validationResult?.fields?.chatModel], t),
    embeddingModel: getFirstFormError([validationResult?.fields?.embeddingModel], t),
    primaryBaseUrl: getFirstFormError([validationResult?.fields?.primaryBaseUrl], t),
    providerTimeoutSeconds: getFirstFormError(
      [validationResult?.fields?.providerTimeoutSeconds],
      t,
    ),
    retrievalEmbeddingModel: getFirstFormError(
      [validationResult?.fields?.retrievalEmbeddingModel],
      t,
    ),
    visionModel: getFirstFormError([validationResult?.fields?.visionModel], t),
  };

  const scrollToField = (field: ProviderSettingsFieldName) => {
    if (field === "retrievalEmbeddingModel" && !advancedOpen) {
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
    setDraft((current) => updater(current));
  };

  const validateDraft = () => {
    const validation = validateProviderSettingsView(draft);
    if (!validation) {
      return false;
    }

    setValidationResult(validation);
    setErrorMessage(getFirstFormError([validation.form], t));
    scrollToField(validation.firstInvalidField);
    return true;
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    clearFeedback();

    if (validateDraft()) {
      return;
    }

    try {
      const result = await onSave(toSettingsPayload(draft));
      const nextDraft = buildProviderSettingsView(result);
      setDraft(nextDraft);
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
      setErrorMessage(error instanceof Error ? error.message : t("saveFailedNotice"));
    }
  };

  const handleTest = async () => {
    clearFeedback();

    if (validateDraft()) {
      return;
    }

    try {
      const result = await onTestProvider(toSettingsPayload(draft));
      const allHealthy =
        result.response.healthy && result.embedding.healthy && result.vision.healthy;
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
      setErrorMessage(error instanceof Error ? error.message : t("testConnectionFailedNotice"));
    }
  };

  return (
    <form className="flex flex-col gap-6" noValidate onSubmit={handleSubmit}>
      <ProviderStatusSummary initialValues={initialValues} t={t} />

      <PrimaryProviderSection
        chatModelLabel={chatModelLabel}
        draft={draft}
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
        embeddingModelLabel={embeddingModelLabel}
      />

      <section className="rounded-[1.5rem] border border-border/60 bg-background/55 px-5 py-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-sm font-medium">{t("advancedSettingsTitle")}</h2>
          </div>
          <Button
            aria-expanded={advancedOpen}
            onClick={() => setAdvancedOpen((current) => !current)}
            size="sm"
            type="button"
            variant={advancedOpen ? "secondary" : "outline"}
          >
            {advancedOpen ? t("advancedSettingsCloseAction") : t("advancedSettingsOpenAction")}
          </Button>
        </div>

        {advancedOpen ? (
          <div className="mt-5 space-y-5">
            <RetrievalOverrideSection
              draft={draft}
              fieldErrorMessages={{
                retrievalEmbeddingModel: fieldErrorMessages.retrievalEmbeddingModel ?? undefined,
              }}
              fieldRefs={fieldRefs}
              handleViewChange={handleViewChange}
              retrievalEmbeddingModelLabel={retrievalEmbeddingModelLabel}
              t={t}
            />

            <TemplateEditorSection draft={draft} handleViewChange={handleViewChange} t={t} />

            <ProviderTimeoutSection
              draft={draft}
              fieldErrorMessages={{
                providerTimeoutSeconds: fieldErrorMessages.providerTimeoutSeconds ?? undefined,
              }}
              fieldRefs={fieldRefs}
              handleViewChange={handleViewChange}
              t={t}
            />
          </div>
        ) : null}
      </section>

      <SettingsActionBar
        errorMessage={errorMessage}
        notice={notice}
        onTest={() => void handleTest()}
        savePending={savePending}
        t={t}
        testPending={testPending}
      />
    </form>
  );
}
