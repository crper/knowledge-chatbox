/**
 * @file 工作台账户菜单组件模块。
 */

import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  ChevronDownIcon,
  CircleHelpIcon,
  LanguagesIcon,
  LogOutIcon,
  MonitorCogIcon,
  MoonStarIcon,
  Settings2Icon,
  SunMediumIcon,
} from "lucide-react";
import { useTranslation } from "react-i18next";
import logoUrl from "@/assets/logo.png";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Link } from "@/lib/app-router";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLinkItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { updatePreferencesMutationOptions } from "@/features/auth/api/auth-query";
import { resolveSettingsSection } from "@/features/settings/settings-sections";
import type { AppUser } from "@/lib/api/client";
import { type AppLanguage, type ThemeMode } from "@/lib/config/constants";
import { buildSettingsPath } from "@/lib/routes";
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

const THEME_ICONS: Record<ThemeMode, typeof MoonStarIcon> = {
  dark: MoonStarIcon,
  light: SunMediumIcon,
  system: MonitorCogIcon,
};

function getThemeIcon(theme: ThemeMode) {
  return THEME_ICONS[theme];
}

function getLanguageLabel(language: AppLanguage, t: (key: string) => string) {
  return language === "zh-CN" ? t("languageZhCN") : t("languageEn");
}

type WorkspaceAccountMenuProps = {
  className?: string;
  compact?: boolean;
  contentPortalContainer?: React.ComponentProps<typeof DropdownMenuContent>["portalContainer"];
  contentPortalled?: boolean;
  onLogout: () => Promise<void>;
  onNavigate?: () => void;
  user: AppUser;
};

/**
 * 渲染工作台账户菜单。
 */
export function WorkspaceAccountMenu({
  className,
  compact = false,
  contentPortalContainer,
  contentPortalled = true,
  onLogout,
  onNavigate,
  user,
}: WorkspaceAccountMenuProps) {
  const { t } = useTranslation("common");
  const queryClient = useQueryClient();
  const settingsPath = buildSettingsPath(resolveSettingsSection(null, user));
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
      <DropdownMenuTrigger
        render={
          <Button
            aria-label={t("accountMenuTrigger")}
            className={cn(
              compact
                ? "group relative mx-auto size-11 rounded-2xl border border-transparent px-0 py-0 text-sidebar-foreground/66 shadow-none transition-[transform,background-color,color,border-color,box-shadow] duration-220 ease-out active:scale-[0.97] hover:-translate-y-[1px] hover:border-sidebar-border/72 hover:bg-sidebar-accent/66 hover:text-sidebar-foreground hover:shadow-[0_12px_26px_-20px_hsl(var(--shadow-color)/0.65)]"
                : "surface-inline h-auto w-full min-w-0 justify-start gap-2.5 rounded-xl px-3 py-2 text-left shadow-none hover:bg-sidebar-accent/36",
              className,
            )}
            size={compact ? "icon" : "lg"}
            type="button"
            variant="ghost"
          />
        }
      >
        {compact ? (
          <Settings2Icon
            aria-hidden="true"
            className="size-[1.15rem] shrink-0 stroke-[2.05] transition-transform duration-220 ease-out group-hover:scale-105"
          />
        ) : (
          <Avatar className="size-9 rounded-lg">
            <AvatarImage alt={t("workspaceLogoAlt")} src={logoUrl} />
            <AvatarFallback>AI</AvatarFallback>
          </Avatar>
        )}

        {compact ? null : (
          <>
            <div className="min-w-0 flex-1">
              <p className="truncate text-[13px] font-medium text-foreground">{user.username}</p>
              <p className="truncate text-[11px] leading-relaxed text-muted-foreground/68">
                {t("workspaceRoleLabel", { role: user.role })}
              </p>
            </div>

            <ChevronDownIcon
              aria-hidden="true"
              className="size-3.5 shrink-0 text-muted-foreground/64"
            />
          </>
        )}
      </DropdownMenuTrigger>

      <DropdownMenuContent
        align={compact ? "center" : "end"}
        className="w-72 min-w-72"
        portalContainer={contentPortalContainer}
        portalled={contentPortalled}
        side="top"
        sideOffset={10}
      >
        <div className="flex items-center gap-3 rounded-lg px-2 py-2">
          <Avatar className="size-10 rounded-xl">
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
        <DropdownMenuLinkItem onClick={onNavigate} render={<Link to={settingsPath} />}>
          <Settings2Icon />
          <span>{t("accountMenuMorePersonalizationAction")}</span>
        </DropdownMenuLinkItem>

        <DropdownMenuSeparator />
        <DropdownMenuItem
          className="text-muted-foreground"
          onClick={() => {
            window.open(
              "https://github.com/crper/knowledge-chatbox#readme",
              "_blank",
              "noopener,noreferrer",
            );
          }}
        >
          <CircleHelpIcon />
          <span>{t("helpAction")}</span>
        </DropdownMenuItem>

        <DropdownMenuItem onClick={handleLogoutSelect} variant="destructive">
          <LogOutIcon />
          <span>{t("logoutAction")}</span>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
