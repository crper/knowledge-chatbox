import { useTranslation } from "react-i18next";

import { BrandMark } from "@/components/shared/brand-mark";
import { Button } from "@/components/ui/button";
import {
  NavigationMenu,
  NavigationMenuItem,
  NavigationMenuList,
} from "@/components/ui/navigation-menu";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Link, NavLink } from "@/lib/app-router";
import type { AppUser } from "@/lib/api/client";
import { buildSettingsPath } from "@/lib/routes";
import { cn } from "@/lib/utils";
import { resolveSettingsSection } from "@/features/settings/settings-sections";
import { WORKSPACE_LINKS } from "../workspace-links";
import { WorkspaceAccountMenu } from "./workspace-account-menu";

type WorkspaceRailProps = {
  accountMenuCompact?: boolean;
  accountMenuPortalled?: boolean;
  compact?: boolean;
  onLogout: () => Promise<void>;
  onNavigate?: () => void;
  pathname: string;
  showCompactTooltips?: boolean;
  user: AppUser;
};

function WorkspaceRailLink({
  compact,
  isActive,
  label,
  onNavigate,
  showCompactTooltips,
  to,
  icon: Icon,
}: {
  compact: boolean;
  icon: (props: React.ComponentProps<"svg">) => React.ReactNode;
  isActive: boolean;
  label: string;
  onNavigate?: () => void;
  showCompactTooltips: boolean;
  to: string;
}) {
  const button = (
    <Button
      className={cn(
        "group relative h-auto border border-transparent shadow-none transition-[transform,background-color,color,border-color,box-shadow] duration-220 ease-out active:scale-[0.97]",
        compact
          ? "mx-auto size-11 rounded-2xl px-0"
          : "w-full justify-start gap-3 rounded-2xl px-3 py-2.5",
        isActive
          ? "!border-sidebar-primary/30 !bg-[linear-gradient(165deg,hsl(var(--sidebar-primary)/0.98)_0%,hsl(var(--sidebar-primary)/0.86)_100%)] !text-sidebar-primary-foreground shadow-[inset_0_1px_0_hsl(var(--surface-highlight)/0.34),0_12px_24px_-16px_hsl(var(--sidebar-primary)/0.76)] hover:!bg-[linear-gradient(165deg,hsl(var(--sidebar-primary)/1)_0%,hsl(var(--sidebar-primary)/0.9)_100%)] hover:!text-sidebar-primary-foreground"
          : "text-sidebar-foreground/66 hover:-translate-y-[1px] hover:border-sidebar-border/72 hover:bg-sidebar-accent/66 hover:text-sidebar-foreground hover:shadow-[0_12px_26px_-20px_hsl(var(--shadow-color)/0.65)]",
      )}
      data-active={isActive}
      size={compact ? "icon" : "lg"}
      variant="ghost"
    >
      <Icon
        aria-hidden="true"
        className="size-[1.15rem] shrink-0 stroke-[2.05] transition-[transform,filter] duration-220 ease-out group-hover:scale-105 group-data-[active=true]:scale-105 group-data-[active=true]:drop-shadow-[0_1px_0_hsl(var(--surface-highlight)/0.4)]"
      />
      {compact ? <span className="sr-only">{label}</span> : <span>{label}</span>}
    </Button>
  );

  if (!compact) {
    return (
      <NavigationMenuItem>
        <NavLink className="w-full" onClick={onNavigate} to={to}>
          {button}
        </NavLink>
      </NavigationMenuItem>
    );
  }

  if (!showCompactTooltips) {
    return (
      <NavigationMenuItem>
        <NavLink className="flex w-full justify-center" onClick={onNavigate} to={to}>
          {button}
        </NavLink>
      </NavigationMenuItem>
    );
  }

  return (
    <NavigationMenuItem>
      <Tooltip>
        <TooltipTrigger
          render={
            <NavLink className="flex w-full justify-center" onClick={onNavigate} to={to}>
              {button}
            </NavLink>
          }
        />
        <TooltipContent
          className="font-sans text-[12px] leading-none tracking-normal whitespace-nowrap"
          side="right"
          sideOffset={8}
        >
          {label}
        </TooltipContent>
      </Tooltip>
    </NavigationMenuItem>
  );
}

export function WorkspaceRail({
  accountMenuCompact,
  accountMenuPortalled = true,
  compact = true,
  onLogout,
  onNavigate,
  pathname,
  showCompactTooltips = true,
  user,
}: WorkspaceRailProps) {
  const { t } = useTranslation("common");
  const settingsPath = buildSettingsPath(resolveSettingsSection(null, user));

  return (
    <aside
      aria-label={t("workspaceSidebarLabel")}
      className={cn("flex h-full min-h-0 flex-col gap-4", compact ? "px-3 py-4" : "px-4 py-4")}
    >
      <Link
        aria-label={t("workspaceTitle")}
        className={cn("flex justify-center", compact ? "" : "justify-start")}
        onClick={onNavigate}
        to={settingsPath}
      >
        <BrandMark
          alt={t("workspaceLogoAlt")}
          compact={compact}
          subtitle={compact ? undefined : t("workspaceSubtitle")}
          title={t("workspaceTitle")}
        />
      </Link>

      <NavigationMenu className="flex-1">
        <NavigationMenuList
          aria-label={t("workspaceModeSection")}
          className="flex min-h-0 flex-1 flex-col gap-2"
        >
          {WORKSPACE_LINKS.map((link) => (
            <WorkspaceRailLink
              compact={compact}
              icon={link.icon}
              isActive={pathname.startsWith(link.to)}
              key={link.to}
              label={t(link.labelKey)}
              onNavigate={onNavigate}
              showCompactTooltips={showCompactTooltips}
              to={link.to}
            />
          ))}
        </NavigationMenuList>
      </NavigationMenu>

      <WorkspaceAccountMenu
        className={compact ? "mx-auto" : undefined}
        compact={accountMenuCompact ?? compact}
        contentPortalled={accountMenuPortalled}
        onLogout={onLogout}
        onNavigate={onNavigate}
        user={user}
      />
    </aside>
  );
}
