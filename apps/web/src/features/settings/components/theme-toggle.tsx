import { MonitorCogIcon, MoonStarIcon, SunMediumIcon } from "lucide-react";
import { useTranslation } from "react-i18next";

import { cn } from "@/lib/utils";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { useTheme } from "@/providers/theme-provider";
import { type ThemeMode } from "@/lib/config/constants";

type ThemeToggleProps = {
  className?: string;
  compact?: boolean;
  onChange?: (theme: ThemeMode) => void;
};

const THEME_ITEMS: ThemeMode[] = ["light", "dark", "system"];

const THEME_ICONS: Record<ThemeMode, typeof MoonStarIcon> = {
  dark: MoonStarIcon,
  light: SunMediumIcon,
  system: MonitorCogIcon,
};

function getThemeLabel(theme: ThemeMode, t: (key: string) => string) {
  return {
    dark: t("themeDark"),
    light: t("themeLight"),
    system: t("themeSystem"),
  }[theme];
}

export function ThemeToggle({ className, compact = false, onChange }: ThemeToggleProps) {
  const { t } = useTranslation("common");
  const { setTheme, theme } = useTheme();

  const handleValueChange = (groupValue: string[]) => {
    const nextTheme = groupValue[0] as ThemeMode | undefined;
    if (nextTheme == null) return;
    setTheme(nextTheme);
    onChange?.(nextTheme);
  };

  return (
    <ToggleGroup
      className={cn(compact ? "" : "grid w-full grid-cols-3 gap-1 p-1", className)}
      onValueChange={handleValueChange}
      value={[theme]}
    >
      {THEME_ITEMS.map((item) => {
        const Icon = THEME_ICONS[item];
        return (
          <ToggleGroupItem
            aria-label={getThemeLabel(item, t)}
            className={cn(compact ? "" : "h-10 justify-center rounded-lg px-3 text-sm md:h-9")}
            key={item}
            value={item}
          >
            <Icon className="size-3.5" />
            {compact ? null : <span>{getThemeLabel(item, t)}</span>}
          </ToggleGroupItem>
        );
      })}
    </ToggleGroup>
  );
}
