/**
 * @file Provider 显示文案工具。
 */

import type { EmbeddingProviderName, ResponseProviderName } from "@/features/settings/api/settings";

export type ProviderDisplayName = ResponseProviderName | EmbeddingProviderName;

const PROVIDER_LABEL_KEYS: Record<ProviderDisplayName, string> = {
  anthropic: "providerClaudeTab",
  ollama: "providerOllamaTab",
  openai: "providerOpenAiTab",
  voyage: "providerVoyageTab",
};

/**
 * 获取 Provider 的显示名称。
 * @param provider - Provider 名称
 * @param t - i18n 翻译函数
 * @returns Provider 的本地化显示名称
 */
export function getProviderLabel(
  provider: ProviderDisplayName,
  t: (key: string, params?: Record<string, unknown>) => string,
) {
  return t(PROVIDER_LABEL_KEYS[provider]);
}

/**
 * 格式化 Provider + Model 的组合显示文案。
 * @param provider - Provider 名称
 * @param model - 模型名称，为空时显示占位符 "-"
 * @param t - i18n 翻译函数
 * @returns 格式化后的 "Provider / Model" 字符串
 */
export function formatProviderProfile(
  provider: ProviderDisplayName,
  model: string | null | undefined,
  t: (key: string, params?: Record<string, unknown>) => string,
) {
  return `${getProviderLabel(provider, t)} / ${model ?? "-"}`;
}
