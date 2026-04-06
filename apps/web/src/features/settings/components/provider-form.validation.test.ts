import { buildAppSettings } from "@/test/fixtures/app";
import { buildProviderSettingsView } from "./provider-form-state";
import {
  getFirstInvalidProviderField,
  validateProviderSettingsForm,
} from "./provider-form.validation";

describe("provider-form.validation", () => {
  it("maps a missing primary chat model to the chatModel slot", () => {
    const baseValues = buildProviderSettingsView(buildAppSettings());
    const values = {
      ...baseValues,
      providerProfiles: {
        ...baseValues.providerProfiles,
        openai: {
          ...baseValues.providerProfiles.openai,
          chat_model: "   ",
        },
      },
    };

    const validation = validateProviderSettingsForm(values);

    expect(validation?.fields?.chatModel).toEqual({
      i18nKey: "settings:chatModelRequiredError",
    });
    expect(validation?.form).toEqual({
      i18nKey: "settings:providerValidationSummaryError",
    });
    expect(getFirstInvalidProviderField(values)).toBe("chatModel");
  });

  it("maps a missing retrieval override embedding model to the advanced retrieval slot", () => {
    const baseValues = buildProviderSettingsView(
      buildAppSettings({
        embedding_route: {
          provider: "voyage",
          model: "voyage-3.5",
        },
        pending_embedding_route: {
          provider: "voyage",
          model: "voyage-3.5",
        },
      }),
    );
    const values = {
      ...baseValues,
      providerProfiles: {
        ...baseValues.providerProfiles,
        voyage: {
          ...baseValues.providerProfiles.voyage,
          embedding_model: "   ",
        },
      },
      retrievalOverrideEnabled: true,
      retrievalProvider: "voyage" as const,
    };

    const validation = validateProviderSettingsForm(values);

    expect(validation?.fields?.retrievalEmbeddingModel).toEqual({
      i18nKey: "settings:retrievalEmbeddingModelRequiredError",
    });
    expect(getFirstInvalidProviderField(values)).toBe("retrievalEmbeddingModel");
  });

  it("maps an out-of-range timeout to the timeout slot", () => {
    const values = {
      ...buildProviderSettingsView(buildAppSettings()),
      providerTimeoutSeconds: 601,
    };

    const validation = validateProviderSettingsForm(values);

    expect(validation?.fields?.providerTimeoutSeconds).toEqual({
      i18nKey: "settings:providerTimeoutInvalidError",
    });
    expect(getFirstInvalidProviderField(values)).toBe("providerTimeoutSeconds");
  });
});
