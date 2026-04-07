/**
 * @file 工作区相关界面组件模块。
 */

import { useTranslation } from "react-i18next";
import { BrandMark } from "@/components/shared/brand-mark";
import { Link, NavLink } from "@/lib/app-router";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter as SidebarFooterSection,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenuButton,
  SidebarProvider,
  SidebarSeparator,
} from "@/components/ui/sidebar";
import type { AppUser } from "@/lib/api/client";
import { buildSettingsPath, normalizeSettingsSectionPath } from "@/lib/routes";
import { cn } from "@/lib/utils";
import { getSettingsSections, resolveSettingsSection } from "@/features/settings/settings-sections";
import { WorkspaceAccountMenu } from "./workspace-account-menu";
import { WORKSPACE_LINKS } from "../workspace-links";

/**
 * 定义工作区模式Switcher。
 */
export function WorkspaceModeSwitcher({
  onNavigate,
  pathname,
}: {
  onNavigate?: () => void;
  pathname: string;
}) {
  const { t } = useTranslation("common");

  return (
    <SidebarGroup className="gap-2.5 p-0">
      <SidebarGroupLabel className="h-auto px-0 text-ui-kicker text-muted-foreground">
        {t("workspaceModeSection")}
      </SidebarGroupLabel>
      <SidebarGroupContent>
        <div className="surface-panel-subtle grid grid-cols-2 gap-1.5 rounded-2xl p-1.5">
          {WORKSPACE_LINKS.map((link) => {
            const Icon = link.icon;
            const isActive = pathname.startsWith(link.to);

            return (
              <SidebarMenuButton
                key={link.to}
                className={cn(
                  "h-auto min-h-11 select-none rounded-xl border px-3 py-2.5 text-center text-sm font-semibold shadow-none transition-[background-color,border-color,color,box-shadow,transform] duration-200 ease-out md:min-h-10",
                  "justify-center gap-2 max-[380px]:px-2.5 max-[380px]:text-xs",
                  "data-[active=true]:border-primary/22 data-[active=true]:bg-primary data-[active=true]:text-primary-foreground data-[active=true]:shadow-[0_12px_26px_-18px_hsl(var(--primary)/0.6)] data-[active=true]:hover:bg-primary/94 data-[active=true]:hover:text-primary-foreground",
                  "data-[active=false]:border-transparent data-[active=false]:bg-transparent data-[active=false]:text-foreground/70 data-[active=false]:hover:border-border/60 data-[active=false]:hover:bg-background/62 data-[active=false]:hover:text-foreground data-[active=false]:active:scale-[0.97]",
                )}
                isActive={isActive}
                render={<NavLink className="w-full" onClick={onNavigate} to={link.to} />}
                size="lg"
              >
                <Icon aria-hidden="true" />
                <span className="text-center leading-none">{t(link.labelKey)}</span>
              </SidebarMenuButton>
            );
          })}
        </div>
      </SidebarGroupContent>
    </SidebarGroup>
  );
}

function SettingsSidebarNav({
  onNavigate,
  pathname,
  user,
}: {
  onNavigate?: () => void;
  pathname: string;
  user: AppUser;
}) {
  const { t } = useTranslation("settings");

  if (!pathname.startsWith("/settings")) {
    return null;
  }

  const activeSection = resolveSettingsSection(normalizeSettingsSectionPath(pathname), user);
  const sections = getSettingsSections(user);

  return (
    <SidebarGroup className="mt-6 min-h-0 flex-1 p-0">
      <SidebarGroupLabel className="h-auto px-0 text-ui-kicker text-muted-foreground">
        {t("navigationLabel")}
      </SidebarGroupLabel>
      <SidebarGroupContent className="mt-2.5">
        <div className="grid gap-1">
          {sections.map((section) => {
            const isActive = section.id === activeSection;

            return (
              <SidebarMenuButton
                key={section.id}
                className={cn(
                  "h-9 rounded-xl px-3 text-sm shadow-none",
                  "data-[active=true]:bg-sidebar-accent/72 data-[active=true]:text-foreground",
                  "data-[active=false]:text-muted-foreground data-[active=false]:hover:bg-sidebar-accent/42 data-[active=false]:hover:text-foreground",
                )}
                isActive={isActive}
                render={<Link onClick={onNavigate} to={buildSettingsPath(section.id)} />}
              >
                {t(section.titleKey)}
              </SidebarMenuButton>
            );
          })}
        </div>
      </SidebarGroupContent>
    </SidebarGroup>
  );
}

/**
 * 定义工作区底部。
 */
function WorkspaceFooter({
  className,
  onNavigate,
  onLogout,
  user,
}: {
  className?: string;
  onNavigate?: () => void;
  onLogout: () => Promise<void>;
  user: AppUser;
}) {
  return (
    <SidebarFooterSection className={cn("mt-auto gap-3 p-4 pt-0", className)}>
      <SidebarSeparator className="mx-0" />
      <WorkspaceAccountMenu onLogout={onLogout} onNavigate={onNavigate} user={user} />
    </SidebarFooterSection>
  );
}

/**
 * 渲染标准侧栏。
 */
export function StandardSidebar({
  className,
  onNavigate,
  onLogout,
  pathname,
  surface = "default",
  user,
}: {
  className?: string;
  onNavigate?: () => void;
  onLogout: () => Promise<void>;
  pathname: string;
  surface?: "default" | "embedded";
  user: AppUser;
}) {
  const { t } = useTranslation("common");
  const isEmbedded = surface === "embedded";

  return (
    <SidebarProvider className="h-full min-h-0 w-full">
      <Sidebar
        aria-label={t("workspaceSidebarLabel")}
        className={cn(
          isEmbedded
            ? "h-full w-full bg-transparent px-5 py-5 text-sidebar-foreground"
            : "surface-panel-subtle h-full w-full rounded-2xl text-sidebar-foreground",
          className,
        )}
        collapsible="none"
        role="complementary"
      >
        <SidebarHeader className={isEmbedded ? "p-0" : "p-4 pb-0"}>
          <BrandMark
            alt={t("workspaceLogoAlt")}
            subtitle={t("workspaceSubtitle")}
            title={t("workspaceTitle")}
          />
        </SidebarHeader>

        <SidebarContent
          className={isEmbedded ? "gap-0 overflow-auto px-0 py-6" : "gap-0 overflow-auto px-4 py-4"}
        >
          <WorkspaceModeSwitcher onNavigate={onNavigate} pathname={pathname} />
          <SettingsSidebarNav onNavigate={onNavigate} pathname={pathname} user={user} />
        </SidebarContent>

        <WorkspaceFooter
          className={isEmbedded ? "p-0 pt-0" : undefined}
          onNavigate={onNavigate}
          onLogout={onLogout}
          user={user}
        />
      </Sidebar>
    </SidebarProvider>
  );
}
