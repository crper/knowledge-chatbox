import { buildAppSettings } from "@/test/fixtures/app";
import { buildProviderSettingsView } from "./provider-form-state";
import {
  getFirstInvalidProviderField,
  validateProviderSettingsForm,
} from "./provider-form.validation";

describe("provider-form.validation", () => {
  it("prefers the top-level provider fields when multiple sections are invalid", () => {
    const baseValues = buildProviderSettingsView(buildAppSettings());
    const values = {
      ...baseValues,
      providerTimeoutSeconds: 601,
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
    expect(validation?.fields?.providerTimeoutSeconds).toEqual({
      i18nKey: "settings:providerTimeoutInvalidError",
    });
    expect(getFirstInvalidProviderField(values)).toBe("chatModel");
  });
});
