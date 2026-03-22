/**
 * @file 设置相关界面组件模块。
 */

import { ChevronDownIcon, MonitorCogIcon, MoonStarIcon, SunMediumIcon } from "lucide-react";
import { useTranslation } from "react-i18next";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import { useTheme } from "@/providers/theme-provider";
import { type ThemeMode } from "@/lib/config/constants";

type ThemeToggleProps = {
  className?: string;
  compact?: boolean;
  onChange?: (theme: ThemeMode) => void;
};

const THEME_ITEMS: ThemeMode[] = ["light", "dark", "system"];

/**
 * 渲染主题切换控件。
 */
export function ThemeToggle({ className, compact = false, onChange }: ThemeToggleProps) {
  const { t } = useTranslation("common");
  const { setTheme, theme } = useTheme();
  const currentTheme = theme;

  const handleChange = (nextThemeValue: string) => {
    const nextTheme = nextThemeValue as ThemeMode;
    setTheme(nextTheme);
    onChange?.(nextTheme);
  };

  const currentLabel = {
    dark: t("themeDark"),
    light: t("themeLight"),
    system: t("themeSystem"),
  }[currentTheme];
  const triggerLabel = compact ? currentLabel : `${t("themeLabel")} · ${currentLabel}`;
  const TriggerIcon =
    currentTheme === "dark"
      ? MoonStarIcon
      : currentTheme === "light"
        ? SunMediumIcon
        : MonitorCogIcon;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          aria-label={t("themeLabel")}
          className={cn(compact ? "min-w-24" : "w-full justify-between", className)}
          size={compact ? "sm" : "default"}
          variant="outline"
        >
          <span className="flex min-w-0 items-center gap-2">
            <TriggerIcon className="size-4" />
            <span className="truncate">{triggerLabel}</span>
          </span>
          <ChevronDownIcon className="size-4 text-muted-foreground" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuRadioGroup onValueChange={handleChange} value={currentTheme}>
          {THEME_ITEMS.map((item) => (
            <DropdownMenuRadioItem key={item} value={item}>
              {
                {
                  dark: t("themeDark"),
                  light: t("themeLight"),
                  system: t("themeSystem"),
                }[item]
              }
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
