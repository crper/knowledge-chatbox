import { normalizeText } from "@/lib/forms";
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
  switch (provider) {
    case "anthropic":
      return field === "chat_model"
        ? normalizeText(profiles.anthropic.chat_model)
        : normalizeText(profiles.anthropic.vision_model);
    case "ollama":
      if (field === "chat_model") {
        return normalizeText(profiles.ollama.chat_model);
      }
      return field === "embedding_model"
        ? normalizeText(profiles.ollama.embedding_model)
        : normalizeText(profiles.ollama.vision_model);
    case "openai":
      if (field === "chat_model") {
        return normalizeText(profiles.openai.chat_model);
      }
      return field === "embedding_model"
        ? normalizeText(profiles.openai.embedding_model)
        : normalizeText(profiles.openai.vision_model);
    case "voyage":
      return normalizeText(profiles.voyage.embedding_model);
  }
}

export function setProviderProfileModel<P extends ProviderModelProvider>(
  profiles: ProviderProfiles,
  provider: P,
  field: ProviderModelField<P>,
  value: string,
): ProviderProfiles {
  const normalizedValue = normalizeText(value);
  const nextProfiles: ProviderProfiles = {
    ...profiles,
    anthropic: { ...profiles.anthropic },
    ollama: { ...profiles.ollama },
    openai: { ...profiles.openai },
    voyage: { ...profiles.voyage },
  };

  switch (provider) {
    case "anthropic":
      if (field === "chat_model") {
        nextProfiles.anthropic.chat_model = normalizedValue;
      } else {
        nextProfiles.anthropic.vision_model = normalizedValue;
      }
      return nextProfiles;
    case "ollama":
      if (field === "chat_model") {
        nextProfiles.ollama.chat_model = normalizedValue;
      } else if (field === "embedding_model") {
        nextProfiles.ollama.embedding_model = normalizedValue;
      } else {
        nextProfiles.ollama.vision_model = normalizedValue;
      }
      return nextProfiles;
    case "openai":
      if (field === "chat_model") {
        nextProfiles.openai.chat_model = normalizedValue;
      } else if (field === "embedding_model") {
        nextProfiles.openai.embedding_model = normalizedValue;
      } else {
        nextProfiles.openai.vision_model = normalizedValue;
      }
      return nextProfiles;
    case "voyage":
      nextProfiles.voyage.embedding_model = normalizedValue;
      return nextProfiles;
  }
}
