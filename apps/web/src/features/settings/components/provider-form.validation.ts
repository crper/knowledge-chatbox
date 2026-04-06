import type { ZodIssue } from "zod";

import { zodToTanStackFormErrors } from "@/lib/validation/form-adapter";
import { providerSettingsSchema } from "@/lib/validation/schemas";
import type { ProviderSettingsFieldName, ProviderSettingsView } from "./provider-form-state";
import { getDefaultEmbeddingProvider } from "./provider-form-state";

function mapProviderIssueToField(
  issue: Pick<ZodIssue, "path">,
  values: ProviderSettingsView,
): ProviderSettingsFieldName | null {
  const [scope, provider, field] = issue.path;

  if (scope === "providerTimeoutSeconds") {
    return "providerTimeoutSeconds";
  }

  if (scope !== "providerProfiles" || typeof provider !== "string" || typeof field !== "string") {
    return null;
  }

  if (provider === values.primaryProvider && field === "chat_model") {
    return "chatModel";
  }

  if (provider === values.primaryProvider && field === "vision_model") {
    return "visionModel";
  }

  if (provider === values.primaryProvider && field === "base_url") {
    return "primaryBaseUrl";
  }

  if (field !== "embedding_model") {
    return null;
  }

  if (values.retrievalOverrideEnabled && provider === values.retrievalProvider) {
    return "retrievalEmbeddingModel";
  }

  return provider === getDefaultEmbeddingProvider(values.primaryProvider) ? "embeddingModel" : null;
}

export function validateProviderSettingsForm(values: ProviderSettingsView) {
  const result = providerSettingsSchema.safeParse(values);

  if (result.success) {
    return undefined;
  }

  return zodToTanStackFormErrors<ProviderSettingsFieldName>(result.error, {
    formI18nKey: "settings:providerValidationSummaryError",
    mapIssueToField: (issue) => mapProviderIssueToField(issue, values),
    values,
  });
}

export function getFirstInvalidProviderField(
  values: ProviderSettingsView,
): ProviderSettingsFieldName | null {
  const result = providerSettingsSchema.safeParse(values);

  if (result.success) {
    return null;
  }

  for (const issue of result.error.issues) {
    const field = mapProviderIssueToField(issue, values);
    if (field) {
      return field;
    }
  }

  return null;
}
