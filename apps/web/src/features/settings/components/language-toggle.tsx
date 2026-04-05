/**
 * @file 设置相关界面组件模块。
 */

import { ChevronDownIcon, LanguagesIcon } from "lucide-react";
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
import { type AppLanguage } from "@/lib/config/constants";
import { useUiStore } from "@/lib/store/ui-store";

type LanguageToggleProps = {
  compact?: boolean;
  className?: string;
};

const LANGUAGE_ITEMS: AppLanguage[] = ["zh-CN", "en"];

/**
 * 渲染语言切换控件。
 */
export function LanguageToggle({ compact = false, className }: LanguageToggleProps) {
  const { t } = useTranslation("common");
  const language = useUiStore((state) => state.language);
  const setLanguage = useUiStore((state) => state.setLanguage);

  const handleChange = (nextLanguage: string) => {
    const value = nextLanguage as AppLanguage;
    setLanguage(value);
  };

  const currentLabel = language === "zh-CN" ? t("languageZhCN") : t("languageEn");
  const triggerLabel = compact ? currentLabel : `${t("languageLabel")} · ${currentLabel}`;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button
            aria-label={t("languageLabel")}
            className={cn(compact ? "min-w-24" : "w-full justify-between", className)}
            size={compact ? "sm" : "default"}
            variant="outline"
          />
        }
      >
        <span className="flex min-w-0 items-center gap-2">
          <LanguagesIcon className="size-4" />
          <span className="truncate">{triggerLabel}</span>
        </span>
        <ChevronDownIcon className="size-4 text-muted-foreground" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuRadioGroup onValueChange={handleChange} value={language}>
          {LANGUAGE_ITEMS.map((item) => {
            const label = item === "zh-CN" ? t("languageZhCN") : t("languageEn");

            return (
              <DropdownMenuRadioItem key={item} value={item}>
                {label}
              </DropdownMenuRadioItem>
            );
          })}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
