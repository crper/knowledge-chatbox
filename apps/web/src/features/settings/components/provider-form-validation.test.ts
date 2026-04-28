import { buildAppSettings } from "@/test/fixtures/app";
import { buildProviderSettingsView } from "./provider-form-state";
import { mapProviderIssueToField, validateProviderSettings } from "./provider-form-validation";

describe("provider-form-validation", () => {
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

    const result = validateProviderSettings(values);

    expect(result).toBeDefined();
    expect(result?.fields?.chatModel).toBe("settings:chatModelRequiredError");
    expect(result?.fields?.providerTimeoutSeconds).toBe("settings:providerTimeoutInvalidError");
  });

  it("returns undefined for valid values", () => {
    const values = buildProviderSettingsView(buildAppSettings());
    const result = validateProviderSettings(values);
    expect(result).toBeUndefined();
  });
});

describe("mapProviderIssueToField", () => {
  it("maps providerTimeoutSeconds path", () => {
    const values = buildProviderSettingsView(buildAppSettings());
    const result = mapProviderIssueToField({ path: ["providerTimeoutSeconds"] }, values);
    expect(result).toBe("providerTimeoutSeconds");
  });

  it("maps primary provider chat_model to chatModel", () => {
    const values = buildProviderSettingsView(buildAppSettings());
    const result = mapProviderIssueToField(
      { path: ["providerProfiles", values.primaryProvider, "chat_model"] },
      values,
    );
    expect(result).toBe("chatModel");
  });

  it("returns null for unrelated provider paths", () => {
    const values = buildProviderSettingsView(buildAppSettings());
    const result = mapProviderIssueToField(
      { path: ["providerProfiles", "anthropic", "chat_model"] },
      values,
    );
    expect(result).toBeNull();
  });
});
