import type { ZodIssue } from "zod";

import type { ProviderSettingsFieldName, ProviderSettingsView } from "./provider-form-state";
import { getDefaultEmbeddingProvider } from "./provider-form-state";
import { providerSettingsSchema } from "@/lib/validation/schemas";

/**
 * 将 Zod issue 的嵌套路径映射到表单扁平字段名。
 */
export function mapProviderIssueToField(
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

/**
 * Provider 表单自定义校验器：调用 Zod schema 并将 issue 映射到表单字段名。
 * 返回 TanStack Form 原生错误格式。
 */
export function validateProviderSettings(values: ProviderSettingsView) {
  const result = providerSettingsSchema.safeParse(values);
  if (result.success) return undefined;

  const fields: Partial<Record<ProviderSettingsFieldName, string>> = {};

  for (const issue of result.error.issues) {
    const fieldName = mapProviderIssueToField(issue, values);
    if (fieldName && !fields[fieldName]) {
      fields[fieldName] = issue.message;
    }
  }

  return {
    fields,
    form: "settings:providerValidationSummaryError",
  };
}
