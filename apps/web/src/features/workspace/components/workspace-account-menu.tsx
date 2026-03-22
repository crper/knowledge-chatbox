/**
 * @file 工作台账户菜单组件模块。
 */

import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  ChevronDownIcon,
  LanguagesIcon,
  LogOutIcon,
  MonitorCogIcon,
  MoonStarIcon,
  Settings2Icon,
  SunMediumIcon,
} from "lucide-react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";

import logoUrl from "@/assets/logo.png";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { updatePreferencesMutationOptions } from "@/features/auth/api/auth-query";
import type { AppUser } from "@/lib/api/client";
import { type AppLanguage, type ThemeMode } from "@/lib/config/constants";
import { cn } from "@/lib/utils";
import { useUiStore } from "@/lib/store/ui-store";
import { useTheme } from "@/providers/theme-provider";

const LANGUAGE_ITEMS: AppLanguage[] = ["zh-CN", "en"];
const THEME_ITEMS: ThemeMode[] = ["light", "dark", "system"];

function getThemeLabel(theme: ThemeMode, t: (key: string) => string) {
  return {
    dark: t("themeDark"),
    light: t("themeLight"),
    system: t("themeSystem"),
  }[theme];
}

function getThemeIcon(theme: ThemeMode) {
  return theme === "dark" ? MoonStarIcon : theme === "light" ? SunMediumIcon : MonitorCogIcon;
}

function getLanguageLabel(language: AppLanguage, t: (key: string) => string) {
  return language === "zh-CN" ? t("languageZhCN") : t("languageEn");
}

type WorkspaceAccountMenuProps = {
  className?: string;
  onLogout: () => Promise<void>;
  onNavigate?: () => void;
  user: AppUser;
};

/**
 * 渲染工作台账户菜单。
 */
export function WorkspaceAccountMenu({
  className,
  onLogout,
  onNavigate,
  user,
}: WorkspaceAccountMenuProps) {
  const { t } = useTranslation("common");
  const queryClient = useQueryClient();
  const language = useUiStore((state) => state.language);
  const setLanguage = useUiStore((state) => state.setLanguage);
  const { setTheme, theme } = useTheme();
  const preferenceMutation = useMutation(updatePreferencesMutationOptions(queryClient));

  const handleThemeChange = (nextThemeValue: string) => {
    const nextTheme = nextThemeValue as ThemeMode;
    setTheme(nextTheme);
    preferenceMutation.mutate({ themePreference: nextTheme });
  };

  const handleLanguageChange = (nextLanguageValue: string) => {
    setLanguage(nextLanguageValue as AppLanguage);
  };

  const handleLogoutSelect = () => {
    onNavigate?.();
    void onLogout();
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          aria-label={t("accountMenuTrigger")}
          className={cn(
            "surface-outline flex w-full cursor-pointer select-none items-center gap-3 rounded-xl px-3 py-2.5 text-left transition-colors hover:bg-sidebar-accent/42 hover:text-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50",
            className,
          )}
          type="button"
        >
          <Avatar className="size-10 rounded-[0.9rem]">
            <AvatarImage alt={t("workspaceLogoAlt")} src={logoUrl} />
            <AvatarFallback>AI</AvatarFallback>
          </Avatar>

          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium text-foreground">{user.username}</p>
            <p className="truncate text-xs text-muted-foreground">
              {t("workspaceRoleLabel", { role: user.role })}
            </p>
          </div>

          <ChevronDownIcon aria-hidden="true" className="size-4 shrink-0 text-muted-foreground" />
        </button>
      </DropdownMenuTrigger>

      <DropdownMenuContent align="end" className="w-72 min-w-72">
        <div className="flex items-center gap-3 rounded-lg px-2 py-2">
          <Avatar className="size-10 rounded-[0.9rem]">
            <AvatarImage alt={t("workspaceLogoAlt")} src={logoUrl} />
            <AvatarFallback>AI</AvatarFallback>
          </Avatar>
          <div className="min-w-0">
            <p className="truncate text-sm font-medium text-foreground">{user.username}</p>
            <p className="truncate text-xs text-muted-foreground">
              {t("workspaceRoleLabel", { role: user.role })}
            </p>
          </div>
        </div>

        <DropdownMenuSeparator />
        <DropdownMenuLabel>{t("accountMenuAppearanceLabel")}</DropdownMenuLabel>
        <DropdownMenuRadioGroup onValueChange={handleThemeChange} value={theme}>
          {THEME_ITEMS.map((item) => {
            const Icon = getThemeIcon(item);

            return (
              <DropdownMenuRadioItem key={item} className="gap-2 py-2 pr-8 pl-2" value={item}>
                <Icon className="size-4 text-muted-foreground" />
                <span>{getThemeLabel(item, t)}</span>
              </DropdownMenuRadioItem>
            );
          })}
        </DropdownMenuRadioGroup>

        <DropdownMenuSeparator />
        <DropdownMenuLabel>{t("languageLabel")}</DropdownMenuLabel>
        <DropdownMenuRadioGroup onValueChange={handleLanguageChange} value={language}>
          {LANGUAGE_ITEMS.map((item) => (
            <DropdownMenuRadioItem key={item} className="gap-2 py-2 pr-8 pl-2" value={item}>
              <LanguagesIcon className="size-4 text-muted-foreground" />
              <span>{getLanguageLabel(item, t)}</span>
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>

        <DropdownMenuSeparator />
        <DropdownMenuItem asChild>
          <Link onClick={onNavigate} to="/settings">
            <Settings2Icon />
            <span>{t("accountMenuMorePersonalizationAction")}</span>
          </Link>
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={handleLogoutSelect} variant="destructive">
          <LogOutIcon />
          <span>{t("logoutAction")}</span>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
