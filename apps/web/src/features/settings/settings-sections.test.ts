import { describe, expect, it } from "vite-plus/test";

import type { AppUser } from "@/lib/api/client";
import { getDefaultSettingsSection, resolveSettingsSection } from "./settings-sections";

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
  it("returns role-based default sections", () => {
    expect(getDefaultSettingsSection(buildUser("admin"))).toBe("providers");
    expect(getDefaultSettingsSection(buildUser("user"))).toBe("preferences");
  });

  it("keeps allowed sections and falls back when the raw value is invalid", () => {
    expect(resolveSettingsSection("security", buildUser("user"))).toBe("security");
    expect(resolveSettingsSection("providers", buildUser("admin"))).toBe("providers");
    expect(resolveSettingsSection("management", buildUser("user"))).toBe("preferences");
    expect(resolveSettingsSection("system", buildUser("admin"))).toBe("providers");
    expect(resolveSettingsSection("unknown", buildUser("admin"))).toBe("providers");
  });
});
