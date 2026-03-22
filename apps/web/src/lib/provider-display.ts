/**
 * @file Provider 显示文案工具。
 */

import type {
  EmbeddingProviderName,
  ResponseProviderName,
  VisionProviderName,
} from "@/features/settings/api/settings";

export type ProviderDisplayName = ResponseProviderName | EmbeddingProviderName | VisionProviderName;

export function getProviderLabel(
  provider: ProviderDisplayName,
  t: (key: string, params?: Record<string, unknown>) => string,
) {
  if (provider === "anthropic") {
    return t("providerClaudeTab");
  }

  if (provider === "voyage") {
    return "Voyage";
  }

  if (provider === "ollama") {
    return t("providerOllamaTab");
  }

  return t("providerOpenAiTab");
}

export function formatProviderProfile(
  provider: ProviderDisplayName,
  model: string | null | undefined,
  t: (key: string, params?: Record<string, unknown>) => string,
) {
  return `${getProviderLabel(provider, t)} / ${model ?? "-"}`;
}
