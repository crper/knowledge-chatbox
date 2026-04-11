import type { ReactNode } from "react";
import { PanelLeftIcon, PanelRightIcon } from "lucide-react";

import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { CollapsedEdgeHandle } from "@/features/workspace/components/collapsed-edge-handle";
import { cn } from "@/lib/utils";

type ChatDesktopShellProps = {
  children: ReactNode;
  contextPanel: ReactNode;
  expandSidebarLabel: string;
  gridTemplate: string;
  onExpandSidebar: () => void;
  sidebar: ReactNode;
  sidebarCollapsed: boolean;
  workspaceRail: ReactNode;
};

type ChatMobileShellProps = {
  children: ReactNode;
  closeActionLabel?: string;
  contextActionLabel: string;
  contextDescription: string;
  contextOpen: boolean;
  contextPanel: ReactNode;
  contextTitle: string;
  navigation: ReactNode;
  navigationActionLabel: string;
  navigationDescription: string;
  navigationOpen: boolean;
  navigationTitle: string;
  onContextOpenChange: (open: boolean) => void;
  onNavigationOpenChange: (open: boolean) => void;
  workspaceLabel: string;
};

type StandardDesktopShellProps = {
  children: ReactNode;
  contentRailTestId?: string;
  isSettingsRoute: boolean;
  sidebar?: ReactNode;
  workspaceRail: ReactNode;
};

type StandardMobileShellProps = {
  children: ReactNode;
  closeActionLabel?: string;
  navigation: ReactNode;
  navigationActionLabel: string;
  navigationDescription: string;
  navigationOpen: boolean;
  navigationTitle: string;
  onNavigationOpenChange: (open: boolean) => void;
  workspaceLabel: string;
};

export function ChatDesktopShell({
  children,
  contextPanel,
  expandSidebarLabel,
  gridTemplate,
  onExpandSidebar,
  sidebar,
  sidebarCollapsed,
  workspaceRail,
}: ChatDesktopShellProps) {
  return (
    <div
      className="surface-elevated grid h-[calc(100dvh-1.75rem)] min-h-[calc(100dvh-1.75rem)] min-w-0 overflow-hidden rounded-2xl transition-[grid-template-columns] duration-250 ease-out"
      data-testid="chat-desktop-layout"
      style={{
        height: "calc(100vh - 1.75rem)",
        minHeight: "calc(100vh - 1.75rem)",
        gridTemplateColumns: gridTemplate,
      }}
    >
      <div
        className="min-h-0 min-w-0 overflow-hidden border-r border-border/50 bg-sidebar/34"
        data-testid="chat-desktop-workspace-rail"
      >
        {workspaceRail}
      </div>
      <div
        className={cn(
          "min-h-0 min-w-0 overflow-hidden bg-sidebar/56",
          sidebarCollapsed ? "" : "border-r border-border/60",
        )}
      >
        {sidebarCollapsed ? null : sidebar}
      </div>
      <div className="relative flex h-full min-h-0 min-w-0 flex-col overflow-visible bg-transparent">
        <div
          className="relative flex h-full min-h-0 min-w-0 flex-col overflow-hidden bg-transparent"
          id="main-content"
        >
          {children}
          {sidebarCollapsed ? (
            <CollapsedEdgeHandle
              buttonLabel={expandSidebarLabel}
              onExpand={onExpandSidebar}
              side="left"
            />
          ) : null}
        </div>
      </div>
      <div className="min-h-0 min-w-0 overflow-hidden border-l border-border/60 bg-background/34">
        {contextPanel}
      </div>
    </div>
  );
}

export function ChatMobileShell({
  children,
  closeActionLabel = "Close",
  contextActionLabel,
  contextDescription,
  contextOpen,
  contextPanel,
  contextTitle,
  navigation,
  navigationActionLabel,
  navigationDescription,
  navigationOpen,
  navigationTitle,
  onContextOpenChange,
  onNavigationOpenChange,
  workspaceLabel,
}: ChatMobileShellProps) {
  return (
    <div className="flex min-h-[calc(100dvh-1.75rem)] flex-col gap-2.5">
      <div className="surface-elevated grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-2 rounded-xl px-2 py-1.5 transition-[background-color,border-color,box-shadow] duration-200">
        <Sheet onOpenChange={onNavigationOpenChange} open={navigationOpen}>
          <SheetTrigger
            render={<Button aria-label={navigationActionLabel} size="icon-sm" variant="ghost" />}
          >
            <PanelLeftIcon />
          </SheetTrigger>
          <SheetContent
            className="w-[88vw] max-w-sm bg-background/96 p-0"
            closeLabel={closeActionLabel}
            side="left"
          >
            <SheetHeader className="border-b border-border/60">
              <SheetTitle>{navigationTitle}</SheetTitle>
              <SheetDescription>{navigationDescription}</SheetDescription>
            </SheetHeader>
            <div className="min-h-0 flex-1 px-4 pb-4 pt-3">{navigation}</div>
          </SheetContent>
        </Sheet>

        <div className="min-w-0 px-1 text-center">
          <p className="truncate text-sm font-medium text-foreground/92">{workspaceLabel}</p>
        </div>

        <Sheet onOpenChange={onContextOpenChange} open={contextOpen}>
          <SheetTrigger
            render={<Button aria-label={contextActionLabel} size="icon-sm" variant="ghost" />}
          >
            <PanelRightIcon />
          </SheetTrigger>
          <SheetContent
            className="w-[88vw] max-w-sm bg-background/96 p-0"
            closeLabel={closeActionLabel}
            side="right"
          >
            <SheetHeader className="border-b border-border/60">
              <SheetTitle>{contextTitle}</SheetTitle>
              <SheetDescription>{contextDescription}</SheetDescription>
            </SheetHeader>
            <div className="min-h-0 flex-1 px-4 pb-4 pt-3">{contextPanel}</div>
          </SheetContent>
        </Sheet>
      </div>

      <div className="surface-elevated flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden rounded-2xl">
        {children}
      </div>
    </div>
  );
}

export function StandardDesktopShell({
  children,
  contentRailTestId = "standard-desktop-content-rail",
  isSettingsRoute,
  sidebar,
  workspaceRail,
}: StandardDesktopShellProps) {
  return (
    <div
      className="surface-elevated grid h-[calc(100dvh-1.75rem)] min-h-[calc(100dvh-1.75rem)] gap-0 overflow-hidden rounded-2xl"
      data-testid="standard-desktop-layout"
      style={{
        height: "calc(100vh - 1.75rem)",
        minHeight: "calc(100vh - 1.75rem)",
        gridTemplateColumns: isSettingsRoute
          ? "4.75rem 15.75rem minmax(0, 1fr)"
          : "4.75rem minmax(0, 1fr)",
      }}
    >
      <div
        className="min-h-0 min-w-0 overflow-hidden border-r border-border/50 bg-sidebar/34"
        data-testid="workspace-desktop-rail"
      >
        {workspaceRail}
      </div>
      {isSettingsRoute ? (
        <div className="min-h-0 min-w-0 overflow-hidden border-r border-border/50 bg-sidebar/56">
          {sidebar}
        </div>
      ) : null}
      <ScrollArea
        className="flex min-h-0 min-w-0 flex-col overflow-y-auto overscroll-contain bg-background/34"
        contentClassName="min-w-0 w-full"
        data-testid={contentRailTestId}
        hideScrollbar
        viewportClassName="overflow-x-hidden"
        viewportStyle={{ overflowX: "hidden" }}
      >
        {children}
      </ScrollArea>
    </div>
  );
}

export function StandardMobileShell({
  children,
  closeActionLabel = "Close",
  navigation,
  navigationActionLabel,
  navigationDescription,
  navigationOpen,
  navigationTitle,
  onNavigationOpenChange,
  workspaceLabel,
}: StandardMobileShellProps) {
  return (
    <div className="flex min-h-[calc(100dvh-1.75rem)] flex-col gap-2 sm:gap-2.5">
      <div className="surface-elevated grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-2 rounded-xl px-2 py-1.5 transition-[background-color,border-color,box-shadow] duration-200">
        <Sheet onOpenChange={onNavigationOpenChange} open={navigationOpen}>
          <SheetTrigger
            render={<Button aria-label={navigationActionLabel} size="icon-sm" variant="ghost" />}
          >
            <PanelLeftIcon />
          </SheetTrigger>
          <SheetContent
            className="w-[88vw] max-w-sm bg-background/96 p-0"
            closeLabel={closeActionLabel}
            side="left"
          >
            <SheetHeader className="border-b border-border/60">
              <SheetTitle>{navigationTitle}</SheetTitle>
              <SheetDescription>{navigationDescription}</SheetDescription>
            </SheetHeader>
            <div className="min-h-0 flex-1 px-4 pb-4 pt-3">{navigation}</div>
          </SheetContent>
        </Sheet>

        <div className="min-w-0 px-1 text-center">
          <p className="truncate text-sm font-medium text-foreground/92">{workspaceLabel}</p>
        </div>

        <div className="size-11 shrink-0" />
      </div>

      <div
        className="surface-elevated flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden rounded-xl"
        id="main-content"
      >
        {children}
      </div>
    </div>
  );
}
