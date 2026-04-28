import type { ProviderProfiles } from "../api/settings";

type ProviderModelFieldMap = {
  anthropic: "chat_model" | "vision_model";
  ollama: "chat_model" | "embedding_model" | "vision_model";
  openai: "chat_model" | "embedding_model" | "vision_model";
  voyage: "embedding_model";
};

export type ProviderModelProvider = keyof ProviderModelFieldMap;
export type ProviderModelField<P extends ProviderModelProvider> = ProviderModelFieldMap[P];

export function getProviderProfileModel<P extends ProviderModelProvider>(
  profiles: ProviderProfiles,
  provider: P,
  field: ProviderModelField<P>,
): string {
  return (
    (profiles[provider] as Record<ProviderModelField<P>, string | null | undefined>)[
      field
    ]?.trim() ?? ""
  );
}

export function setProviderProfileModel<P extends ProviderModelProvider>(
  profiles: ProviderProfiles,
  provider: P,
  field: ProviderModelField<P>,
  value: string,
): ProviderProfiles {
  const normalizedValue = value.trim();
  return {
    ...profiles,
    [provider]: {
      ...profiles[provider],
      [field]: normalizedValue,
    },
  };
}
