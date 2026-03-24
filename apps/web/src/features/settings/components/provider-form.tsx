/**
 * @file 设置相关界面组件模块。
 */

import { useEffect, useRef, useState } from "react";
import type { FormEvent } from "react";
import { useTranslation } from "react-i18next";

import { Button } from "@/components/ui/button";
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type {
  AppSettings,
  CapabilityHealthResult,
  EmbeddingProviderName,
  ProviderConnectionResult,
  ResponseProviderName,
} from "../api/settings";
import { formatProviderProfile, getProviderLabel } from "@/lib/provider-display";
import {
  buildProviderSettingsView,
  getDefaultEmbeddingProvider,
  PRIMARY_PROVIDER_OPTIONS,
  type ProviderSettingsFieldName,
  type ProviderSettingsValidationResult,
  type PrimaryProviderName,
  type ProviderProfileModels,
  type ProviderSettingsView,
  TEMPLATE_PROVIDER_OPTIONS,
  type TemplateProviderName,
  toSettingsPayload,
  updatePrimaryProvider,
  toggleRetrievalOverride,
  validateProviderSettingsView,
} from "./provider-form-state";
import { getIndexStatusLabel } from "../utils/index-status";
import { SettingsActionBar } from "./provider-form-sections";
import { getFirstFormError, toFieldErrorItems } from "@/lib/forms";

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

type ProfileFieldDefinition = {
  hint?: string;
  key: "api_key" | "base_url" | "chat_model" | "embedding_model" | "vision_model";
  label: string;
  type?: "password" | "text";
};

const providerFormControlClassName = "h-11 rounded-xl border-border/80 bg-background/80 md:h-10";
const providerFormInsetSectionClassName =
  "rounded-[1.25rem] border border-border/60 bg-background/58 p-4";

const PROFILE_FIELDS: Record<TemplateProviderName, ProfileFieldDefinition[]> = {
  openai: [
    { key: "api_key", label: "OpenAI API Key", type: "password" },
    { hint: "openAiBaseUrlHint", key: "base_url", label: "OpenAI Base URL" },
    { key: "chat_model", label: "OpenAI Chat Model" },
    { key: "embedding_model", label: "OpenAI Embedding Model" },
    { key: "vision_model", label: "OpenAI Vision Model" },
  ],
  anthropic: [
    { key: "api_key", label: "Anthropic API Key", type: "password" },
    { hint: "claudeBaseUrlHint", key: "base_url", label: "Anthropic Base URL" },
    { key: "chat_model", label: "Anthropic Chat Model" },
    { key: "vision_model", label: "Anthropic Vision Model" },
  ],
  voyage: [
    { key: "api_key", label: "Voyage API Key", type: "password" },
    { hint: "voyageBaseUrlHint", key: "base_url", label: "Voyage Base URL" },
    { hint: "voyageEmbeddingHint", key: "embedding_model", label: "Voyage Embedding Model" },
  ],
  ollama: [
    { key: "base_url", label: "Ollama Base URL" },
    { key: "chat_model", label: "Ollama Chat Model" },
    { key: "embedding_model", label: "Ollama Embedding Model" },
    { key: "vision_model", label: "Ollama Vision Model" },
  ],
};

function getProfileFieldValue(
  profile: ProviderProfileModels[TemplateProviderName],
  key: ProfileFieldDefinition["key"],
) {
  return (profile as Record<string, string | null | undefined>)[key] ?? "";
}

function getNonPrimaryTemplateOptions(
  primaryProvider: PrimaryProviderName,
): TemplateProviderName[] {
  return TEMPLATE_PROVIDER_OPTIONS.filter((provider) => provider !== primaryProvider);
}

function updateTemplateProfileField(
  current: ProviderSettingsView,
  provider: TemplateProviderName,
  key: ProfileFieldDefinition["key"],
  value: string,
): ProviderSettingsView {
  const nextProfiles = {
    ...current.providerProfiles,
    [provider]: {
      ...current.providerProfiles[provider],
      [key]: value,
    },
  } as ProviderProfileModels;

  return {
    ...current,
    providerProfiles: nextProfiles,
  };
}

function updatePrimaryProfileField(
  current: ProviderSettingsView,
  key: ProfileFieldDefinition["key"],
  value: string,
): ProviderSettingsView {
  const next = updateTemplateProfileField(current, current.primaryProvider, key, value);

  if (key === "chat_model") {
    return { ...next, chatModel: value };
  }

  if (key === "vision_model") {
    return { ...next, visionModel: value };
  }

  const defaultEmbeddingProvider = getDefaultEmbeddingProvider(current.primaryProvider);
  if (key === "embedding_model" && defaultEmbeddingProvider === current.primaryProvider) {
    return {
      ...next,
      embeddingModel: value,
      retrievalEmbeddingModel: current.retrievalOverrideEnabled
        ? current.retrievalEmbeddingModel
        : value,
    };
  }

  return next;
}

function renderProfileFields({
  includeModelFields,
  inputRef,
  manualFieldErrors,
  onChange,
  profile,
  provider,
  t,
}: {
  includeModelFields: boolean;
  inputRef?: (key: ProfileFieldDefinition["key"], node: HTMLInputElement | null) => void;
  manualFieldErrors?: Partial<Record<ProfileFieldDefinition["key"], string>>;
  onChange: (key: ProfileFieldDefinition["key"], value: string) => void;
  profile: ProviderProfileModels[TemplateProviderName];
  provider: TemplateProviderName;
  t: (key: string, params?: Record<string, unknown>) => string;
}) {
  const visibleFields = PROFILE_FIELDS[provider].filter(
    (field) => includeModelFields || !field.key.endsWith("_model"),
  );

  return (
    <FieldGroup className="grid gap-5 md:grid-cols-2">
      {visibleFields.map((field) => (
        <Field key={`${provider}-${field.key}`}>
          <FieldLabel>{field.label}</FieldLabel>
          <Input
            aria-label={field.label}
            aria-invalid={Boolean(manualFieldErrors?.[field.key])}
            className={providerFormControlClassName}
            onChange={(event) => onChange(field.key, event.target.value)}
            ref={(node) => inputRef?.(field.key, node)}
            type={field.type ?? "text"}
            value={getProfileFieldValue(profile, field.key)}
          />
          {field.hint ? <FieldDescription>{t(field.hint)}</FieldDescription> : null}
          <FieldError errors={toFieldErrorItems([], undefined, manualFieldErrors?.[field.key])} />
        </Field>
      ))}
    </FieldGroup>
  );
}

function getCapabilityHealthMessage(
  result: CapabilityHealthResult,
  t: (key: string, params?: Record<string, unknown>) => string,
  ollamaBaseUrl?: string | null,
) {
  if (result.code === "openai_model_not_available") {
    return t("providerTestOpenAiModelNotAvailable", { model: result.model });
  }

  if (result.code === "openai_invalid_api_key") {
    return t("providerTestOpenAiInvalidApiKey");
  }

  if (result.code === "ollama_base_url_unreachable") {
    return t("providerTestOllamaBaseUrlUnreachable", {
      baseUrl: ollamaBaseUrl || "http://localhost:11434",
    });
  }

  return result.message;
}

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

  const activeEmbeddingRoute =
    initialValues.pending_embedding_route ?? initialValues.embedding_route;
  const ollamaBaseUrl = draft.providerProfiles.ollama.base_url;
  const statusSummary = {
    embedding: formatProviderProfile(activeEmbeddingRoute.provider, activeEmbeddingRoute.model, t),
    response: formatProviderProfile(
      initialValues.response_route.provider,
      initialValues.response_route.model,
      t,
    ),
    vision: formatProviderProfile(
      initialValues.vision_route.provider,
      initialValues.vision_route.model,
      t,
    ),
  };

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

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    clearFeedback();

    const validation = validateProviderSettingsView(draft);
    if (validation) {
      setValidationResult(validation);
      setErrorMessage(getFirstFormError([validation.form], t));
      scrollToField(validation.firstInvalidField);
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

    const validation = validateProviderSettingsView(draft);
    if (validation) {
      setValidationResult(validation);
      setErrorMessage(getFirstFormError([validation.form], t));
      scrollToField(validation.firstInvalidField);
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

  const nonPrimaryTemplateOptions = getNonPrimaryTemplateOptions(draft.primaryProvider);
  const templateProvider = nonPrimaryTemplateOptions.includes(draft.templateProvider)
    ? draft.templateProvider
    : (nonPrimaryTemplateOptions[0] ?? "openai");
  const primaryConnectionFields = PROFILE_FIELDS[draft.primaryProvider].filter(
    (field) => !field.key.endsWith("_model"),
  );

  return (
    <form className="flex flex-col gap-6" noValidate onSubmit={handleSubmit}>
      <section className="rounded-[1.5rem] border border-border/60 bg-background/45 px-5 py-5">
        <div className="mb-4">
          <h2 className="text-sm font-medium">{t("statusSummaryTitle")}</h2>
        </div>
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          <div className={providerFormInsetSectionClassName}>
            <p className="text-xs font-medium text-muted-foreground">{t("statusChatLabel")}</p>
            <p className="mt-2 text-sm font-medium">{statusSummary.response}</p>
          </div>
          <div className={providerFormInsetSectionClassName}>
            <p className="text-xs font-medium text-muted-foreground">{t("statusRetrievalLabel")}</p>
            <p className="mt-2 text-sm font-medium">{statusSummary.embedding}</p>
            {initialValues.pending_embedding_route ? (
              <p className="mt-2 text-sm text-muted-foreground">
                {t("pendingRetrievalProfileLabel")}
                {formatProviderProfile(
                  initialValues.pending_embedding_route.provider,
                  initialValues.pending_embedding_route.model,
                  t,
                )}
              </p>
            ) : null}
          </div>
          <div className={providerFormInsetSectionClassName}>
            <p className="text-xs font-medium text-muted-foreground">{t("statusVisionLabel")}</p>
            <p className="mt-2 text-sm font-medium">{statusSummary.vision}</p>
          </div>
          <div className={providerFormInsetSectionClassName}>
            <p className="text-xs font-medium text-muted-foreground">{t("indexStatusCardTitle")}</p>
            <p className="mt-2 text-sm font-medium">
              {getIndexStatusLabel(initialValues.index_rebuild_status, t)}
            </p>
          </div>
        </div>
      </section>

      <section className="rounded-[1.5rem] border border-border/60 bg-background/55 px-5 py-5">
        <div className="mb-5">
          <h2 className="text-sm font-medium">{t("providerCategoryTitle")}</h2>
        </div>

        <FieldGroup className="grid gap-5 md:grid-cols-2">
          <Field>
            <FieldLabel>{t("primaryProviderLabel")}</FieldLabel>
            <Select
              onValueChange={(value) =>
                handleViewChange((current) =>
                  updatePrimaryProvider(current, value as PrimaryProviderName),
                )
              }
              value={draft.primaryProvider}
            >
              <SelectTrigger
                aria-label={t("primaryProviderLabel")}
                className={providerFormControlClassName}
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {PRIMARY_PROVIDER_OPTIONS.map((provider) => (
                  <SelectItem key={provider} value={provider}>
                    {getProviderLabel(provider, t)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <FieldDescription>{t("primaryProviderHint")}</FieldDescription>
          </Field>
          <Field>
            <FieldLabel>{chatModelLabel}</FieldLabel>
            <Input
              aria-label={chatModelLabel}
              aria-invalid={Boolean(fieldErrorMessages.chatModel)}
              className={providerFormControlClassName}
              onChange={(event) =>
                handleViewChange((current) =>
                  updatePrimaryProfileField(current, "chat_model", event.target.value),
                )
              }
              ref={(node) => {
                fieldRefs.current.chatModel = node;
              }}
              value={draft.chatModel}
            />
            <FieldError
              errors={toFieldErrorItems([], undefined, fieldErrorMessages.chatModel ?? undefined)}
            />
          </Field>
          <Field>
            <FieldLabel>{embeddingModelLabel}</FieldLabel>
            <Input
              aria-label={embeddingModelLabel}
              aria-invalid={Boolean(fieldErrorMessages.embeddingModel)}
              className={providerFormControlClassName}
              onChange={(event) =>
                handleViewChange((current) => {
                  const defaultProvider = getDefaultEmbeddingProvider(current.primaryProvider);
                  const next = updateTemplateProfileField(
                    current,
                    defaultProvider,
                    "embedding_model",
                    event.target.value,
                  );

                  return {
                    ...next,
                    embeddingModel: event.target.value,
                    retrievalEmbeddingModel: next.retrievalOverrideEnabled
                      ? next.retrievalEmbeddingModel
                      : event.target.value,
                  };
                })
              }
              ref={(node) => {
                fieldRefs.current.embeddingModel = node;
              }}
              value={draft.embeddingModel}
            />
            <FieldError
              errors={toFieldErrorItems(
                [],
                undefined,
                fieldErrorMessages.embeddingModel ?? undefined,
              )}
            />
          </Field>
          <Field>
            <FieldLabel>{visionModelLabel}</FieldLabel>
            <Input
              aria-label={visionModelLabel}
              aria-invalid={Boolean(fieldErrorMessages.visionModel)}
              className={providerFormControlClassName}
              onChange={(event) =>
                handleViewChange((current) =>
                  updatePrimaryProfileField(current, "vision_model", event.target.value),
                )
              }
              ref={(node) => {
                fieldRefs.current.visionModel = node;
              }}
              value={draft.visionModel}
            />
            <FieldDescription>{t("visionModelHint")}</FieldDescription>
            <FieldError
              errors={toFieldErrorItems([], undefined, fieldErrorMessages.visionModel ?? undefined)}
            />
          </Field>
          {primaryConnectionFields.map((field) => (
            <Field key={`primary-${field.key}`}>
              <FieldLabel>{field.label}</FieldLabel>
              <Input
                aria-label={field.label}
                aria-invalid={
                  field.key === "base_url" && Boolean(fieldErrorMessages.primaryBaseUrl)
                }
                className={providerFormControlClassName}
                onChange={(event) =>
                  handleViewChange((current) =>
                    updatePrimaryProfileField(current, field.key, event.target.value),
                  )
                }
                ref={(node) => {
                  if (field.key === "base_url") {
                    fieldRefs.current.primaryBaseUrl = node;
                  }
                }}
                type={field.type ?? "text"}
                value={getProfileFieldValue(
                  draft.providerProfiles[draft.primaryProvider],
                  field.key,
                )}
              />
              {field.hint ? <FieldDescription>{t(field.hint)}</FieldDescription> : null}
              {field.key === "base_url" ? (
                <FieldError
                  errors={toFieldErrorItems(
                    [],
                    undefined,
                    fieldErrorMessages.primaryBaseUrl ?? undefined,
                  )}
                />
              ) : null}
            </Field>
          ))}
        </FieldGroup>
      </section>

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
            <section className={providerFormInsetSectionClassName}>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="space-y-1.5">
                  <h3 className="text-sm font-medium">{t("retrievalOverrideTitle")}</h3>
                  <p className="text-sm leading-6 text-muted-foreground">
                    {t("retrievalOverrideDescription")}
                  </p>
                </div>
                <Button
                  aria-pressed={draft.retrievalOverrideEnabled}
                  onClick={() => handleViewChange(toggleRetrievalOverride)}
                  size="sm"
                  type="button"
                  variant={draft.retrievalOverrideEnabled ? "secondary" : "outline"}
                >
                  {draft.retrievalOverrideEnabled
                    ? t("retrievalOverrideDisableAction")
                    : t("retrievalOverrideAction")}
                </Button>
              </div>

              {draft.retrievalOverrideEnabled ? (
                <FieldGroup className="mt-4 grid gap-5 md:grid-cols-2">
                  <Field>
                    <FieldLabel>{t("retrievalProviderLabel")}</FieldLabel>
                    <Select
                      onValueChange={(value) =>
                        handleViewChange((current) => ({
                          ...current,
                          retrievalProvider: value as EmbeddingProviderName,
                          retrievalEmbeddingModel:
                            current.providerProfiles[value as EmbeddingProviderName]
                              .embedding_model ?? "",
                        }))
                      }
                      value={draft.retrievalProvider}
                    >
                      <SelectTrigger
                        aria-label={t("retrievalProviderLabel")}
                        className={providerFormControlClassName}
                      >
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {["openai", "voyage", "ollama"].map((provider) => (
                          <SelectItem key={provider} value={provider}>
                            {getProviderLabel(provider as EmbeddingProviderName, t)}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </Field>
                  <Field>
                    <FieldLabel>{retrievalEmbeddingModelLabel}</FieldLabel>
                    <Input
                      aria-label={retrievalEmbeddingModelLabel}
                      aria-invalid={Boolean(fieldErrorMessages.retrievalEmbeddingModel)}
                      className={providerFormControlClassName}
                      onChange={(event) =>
                        handleViewChange((current) => ({
                          ...updateTemplateProfileField(
                            current,
                            current.retrievalProvider,
                            "embedding_model",
                            event.target.value,
                          ),
                          retrievalEmbeddingModel: event.target.value,
                        }))
                      }
                      ref={(node) => {
                        fieldRefs.current.retrievalEmbeddingModel = node;
                      }}
                      value={draft.retrievalEmbeddingModel}
                    />
                    <FieldError
                      errors={toFieldErrorItems(
                        [],
                        undefined,
                        fieldErrorMessages.retrievalEmbeddingModel ?? undefined,
                      )}
                    />
                  </Field>
                </FieldGroup>
              ) : null}
            </section>

            <section className={providerFormInsetSectionClassName}>
              <div className="space-y-1.5">
                <h3 className="text-sm font-medium">{t("templateEditorTitle")}</h3>
                <p className="text-sm leading-6 text-muted-foreground">
                  {t("templateEditorDescription")}
                </p>
              </div>
              <FieldGroup className="mt-4">
                <Field>
                  <FieldLabel>{t("templateProviderLabel")}</FieldLabel>
                  <Select
                    onValueChange={(value) =>
                      handleViewChange((current) => ({
                        ...current,
                        templateProvider: value as TemplateProviderName,
                      }))
                    }
                    value={templateProvider}
                  >
                    <SelectTrigger
                      aria-label={t("templateProviderLabel")}
                      className={providerFormControlClassName}
                    >
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {nonPrimaryTemplateOptions.map((provider) => (
                        <SelectItem key={provider} value={provider}>
                          {getProviderLabel(
                            provider as ResponseProviderName | EmbeddingProviderName,
                            t,
                          )}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </Field>
              </FieldGroup>
              <div className="mt-4">
                {renderProfileFields({
                  includeModelFields: true,
                  onChange: (key, value) =>
                    handleViewChange((current) =>
                      updateTemplateProfileField(current, templateProvider, key, value),
                    ),
                  profile: draft.providerProfiles[templateProvider],
                  provider: templateProvider,
                  t,
                })}
              </div>
            </section>

            <section className={providerFormInsetSectionClassName}>
              <div className="space-y-1.5">
                <h3 className="text-sm font-medium">{t("providerTimeoutLabel")}</h3>
                <p className="text-sm leading-6 text-muted-foreground">
                  {t("providerTimeoutSectionDescription")}
                </p>
              </div>
              <FieldGroup className="mt-4">
                <Field>
                  <FieldLabel>{t("providerTimeoutLabel")}</FieldLabel>
                  <Input
                    aria-label={t("providerTimeoutLabel")}
                    aria-invalid={Boolean(fieldErrorMessages.providerTimeoutSeconds)}
                    className={providerFormControlClassName}
                    min="1"
                    onChange={(event) =>
                      handleViewChange((current) => ({
                        ...current,
                        providerTimeoutSeconds: Number(event.target.value || "0"),
                      }))
                    }
                    ref={(node) => {
                      fieldRefs.current.providerTimeoutSeconds = node;
                    }}
                    type="number"
                    value={String(draft.providerTimeoutSeconds)}
                  />
                  <FieldDescription>{t("providerTimeoutHint")}</FieldDescription>
                  <FieldError
                    errors={toFieldErrorItems(
                      [],
                      undefined,
                      fieldErrorMessages.providerTimeoutSeconds ?? undefined,
                    )}
                  />
                </Field>
              </FieldGroup>
            </section>
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
