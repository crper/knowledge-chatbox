import { describe, expect, it } from "vite-plus/test";

import {
  ADMIN_USERS_PATH,
  CHAT_INDEX_PATH,
  buildChatSessionPath,
  buildSettingsPath,
  normalizeSettingsSectionPath,
  parseChatSessionPathname,
} from "./routes";

describe("routes", () => {
  it("builds canonical settings paths", () => {
    expect(buildSettingsPath("preferences")).toBe("/settings/preferences");
    expect(buildSettingsPath("security")).toBe("/settings/security");
    expect(buildSettingsPath("providers")).toBe("/settings/providers");
    expect(buildSettingsPath("prompt")).toBe("/settings/prompt");
    expect(buildSettingsPath("management")).toBe("/settings/management");
  });

  it("builds canonical chat and admin paths", () => {
    expect(CHAT_INDEX_PATH).toBe("/chat");
    expect(buildChatSessionPath(12)).toBe("/chat/12");
    expect(ADMIN_USERS_PATH).toBe("/admin/users");
  });

  it("normalizes settings section pathnames back to section ids", () => {
    expect(normalizeSettingsSectionPath("/settings/preferences")).toBe("preferences");
    expect(normalizeSettingsSectionPath("/settings/security")).toBe("security");
    expect(normalizeSettingsSectionPath("/settings/providers")).toBe("providers");
    expect(normalizeSettingsSectionPath("/settings/prompt")).toBe("prompt");
    expect(normalizeSettingsSectionPath("/settings/management")).toBe("management");
    expect(normalizeSettingsSectionPath("/settings")).toBe(null);
  });

  it("parses chat session ids from canonical pathnames", () => {
    expect(parseChatSessionPathname("/chat/7")).toBe(7);
    expect(parseChatSessionPathname("/chat")).toBe(null);
    expect(parseChatSessionPathname("/chat/not-a-number")).toBe(null);
  });
});
