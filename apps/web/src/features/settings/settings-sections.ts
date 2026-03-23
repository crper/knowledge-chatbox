/**
 * @file 前端模块。
 */

import type { AppUser } from "@/lib/api/client";

/**
 * 描述设置分区标识的数据结构。
 */
type SettingsSectionId = "providers" | "prompt" | "preferences" | "security" | "management";

type SettingsSectionDefinition = {
  descriptionKey: string;
  id: SettingsSectionId;
  titleKey: string;
};

const SETTINGS_SECTIONS: SettingsSectionDefinition[] = [
  {
    descriptionKey: "providerGroupDescription",
    id: "providers",
    titleKey: "providerGroupTitle",
  },
  {
    descriptionKey: "promptGroupDescription",
    id: "prompt",
    titleKey: "promptGroupTitle",
  },
  {
    descriptionKey: "preferenceGroupDescription",
    id: "preferences",
    titleKey: "preferenceGroupTitle",
  },
  {
    descriptionKey: "securityGroupDescription",
    id: "security",
    titleKey: "securityGroupTitle",
  },
  {
    descriptionKey: "managementSectionDescription",
    id: "management",
    titleKey: "managementSectionTitle",
  },
] as const;

/**
 * 获取设置分区。
 */
export function getSettingsSections(user: AppUser) {
  if (user.role === "admin") {
    return SETTINGS_SECTIONS;
  }

  return SETTINGS_SECTIONS.filter(
    (section) =>
      section.id !== "providers" && section.id !== "prompt" && section.id !== "management",
  );
}

/**
 * 获取默认设置分区。
 */
export function getDefaultSettingsSection(user: AppUser) {
  return user.role === "admin" ? "providers" : "preferences";
}

/**
 * 解析设置分区。
 */
export function resolveSettingsSection(rawSection: string | null, user: AppUser) {
  const availableSections = getSettingsSections(user);

  if (!rawSection) {
    return getDefaultSettingsSection(user);
  }

  const matchedSection = availableSections.find((section) => section.id === rawSection);

  return matchedSection?.id ?? getDefaultSettingsSection(user);
}
