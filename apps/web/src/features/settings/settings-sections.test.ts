import { describe, expect, it } from "vite-plus/test";

import type { AppUser } from "@/lib/api/client";
import {
  getDefaultSettingsSection,
  getSettingsSections,
  resolveSettingsSection,
} from "./settings-sections";

function buildUser(role: "admin" | "user"): AppUser {
  return {
    id: 1,
    username: role,
    role,
    status: "active",
    theme_preference: "system",
  };
}

describe("settings-sections", () => {
  it("returns all settings groups for admins", () => {
    const admin = buildUser("admin");

    expect(getSettingsSections(admin).map((section) => section.id)).toEqual([
      "providers",
      "prompt",
      "preferences",
      "security",
      "management",
    ]);
    expect(getDefaultSettingsSection(admin)).toBe("providers");
  });

  it("returns only self-service groups for normal users", () => {
    const user = buildUser("user");

    expect(getSettingsSections(user).map((section) => section.id)).toEqual([
      "preferences",
      "security",
    ]);
    expect(getDefaultSettingsSection(user)).toBe("preferences");
  });

  it("falls back to the allowed default section when the raw value is invalid", () => {
    expect(resolveSettingsSection("management", buildUser("user"))).toBe("preferences");
    expect(resolveSettingsSection("system", buildUser("admin"))).toBe("providers");
    expect(resolveSettingsSection("unknown", buildUser("admin"))).toBe("providers");
  });
});
