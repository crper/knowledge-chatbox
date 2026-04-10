import { useTranslation } from "react-i18next";

import { cn } from "@/lib/utils";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { type AppLanguage } from "@/lib/config/constants";
import { useUiStore } from "@/lib/store/ui-store";

type LanguageToggleProps = {
  compact?: boolean;
  className?: string;
};

const LANGUAGE_ITEMS: AppLanguage[] = ["zh-CN", "en"];

function getLanguageLabel(language: AppLanguage, t: (key: string) => string) {
  return language === "zh-CN" ? t("languageZhCN") : t("languageEn");
}

function getLanguageDisplay(language: AppLanguage) {
  return language === "zh-CN" ? "简" : "En";
}

export function LanguageToggle({ compact = false, className }: LanguageToggleProps) {
  const { t } = useTranslation("common");
  const language = useUiStore((state) => state.language);
  const setLanguage = useUiStore((state) => state.setLanguage);

  const handleValueChange = (groupValue: string[]) => {
    const nextLanguage = groupValue[0] as AppLanguage | undefined;
    if (nextLanguage == null) return;
    setLanguage(nextLanguage);
  };

  return (
    <ToggleGroup
      className={cn(compact ? "" : "grid w-full grid-cols-2 gap-1 p-1", className)}
      onValueChange={handleValueChange}
      value={[language]}
    >
      {LANGUAGE_ITEMS.map((item) => (
        <ToggleGroupItem
          aria-label={getLanguageLabel(item, t)}
          className={cn(
            compact ? "text-xs font-medium" : "h-10 justify-start rounded-lg px-3 text-sm md:h-9",
          )}
          key={item}
          value={item}
        >
          {compact ? getLanguageDisplay(item) : <span>{getLanguageLabel(item, t)}</span>}
        </ToggleGroupItem>
      ))}
    </ToggleGroup>
  );
}
