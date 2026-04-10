/**
 * @file 应用壳层布局布局模块。
 *
 * TODO: 当前文件包含四种布局模式（桌面聊天/移动聊天/桌面标准/移动标准），
 * 后续可拆分为 ChatDesktopLayout / ChatMobileLayout / StandardDesktopLayout / StandardMobileLayout 子组件。
 */

import { useEffect, useEffectEvent, useMemo, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { PanelLeftIcon, PanelRightIcon } from "lucide-react";

import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Outlet, useLocation, useNavigate } from "@/lib/app-router";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { logout } from "@/features/auth/api/auth";
import { createChatSession } from "@/features/chat/api/chat";
import { buildChatSessionPath } from "@/features/chat/utils/chat-session-route";
import { ChatResourcePanel } from "@/features/workspace/components/chat-resource-panel";
import { ChatSidebar } from "@/features/workspace/components/chat-sidebar";
import { CollapsedEdgeHandle } from "@/features/workspace/components/collapsed-edge-handle";
import { StandardSidebar } from "@/features/workspace/components/standard-sidebar";
import { WorkspaceRail } from "@/features/workspace/components/workspace-rail";
import { getWorkspaceLabelKey } from "@/features/workspace/workspace-links";
import { queryKeys } from "@/lib/api/query-keys";
import { useIsMobile } from "@/lib/hooks/use-mobile";
import type { AppUser } from "@/lib/api/client";
import { logoutSession } from "@/lib/auth/session-manager";
import { cn } from "@/lib/utils";
import { clearComposer } from "@/features/chat/utils/composer-transaction";
import { useThemeSyncService } from "@/providers/theme-sync-service";
import {
  buildChatDesktopGridTemplate,
  type ChatWorkspacePanelsState,
} from "./app-shell-layout-panels";

const DEFAULT_CHAT_WORKSPACE_PANELS: ChatWorkspacePanelsState = {
  leftCollapsed: false,
};

function isEditableHotkeyTarget(target: EventTarget | null) {
  if (!(target instanceof HTMLElement)) {
    return false;
  }

  if (target.isContentEditable) {
    return true;
  }

  const tagName = target.tagName;
  return tagName === "INPUT" || tagName === "TEXTAREA" || tagName === "SELECT";
}

/**
 * 描述应用壳层布局结果。
 */
export function AppShellLayout({ user }: { user: AppUser }) {
  const { t } = useTranslation(["chat", "common"]);
  const location = useLocation();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const isMobile = useIsMobile();
  const [isMobileContextOpen, setIsMobileContextOpen] = useState(false);
  const [isMobileNavigationOpen, setIsMobileNavigationOpen] = useState(false);
  const [searchValue, setSearchValue] = useState("");
  const [chatWorkspacePanels, setChatWorkspacePanels] = useState(DEFAULT_CHAT_WORKSPACE_PANELS);
  const isChatRoute = location.pathname.startsWith("/chat");
  const isSettingsRoute = location.pathname.startsWith("/settings");
  useThemeSyncService({ user });

  useEffect(() => {
    setIsMobileContextOpen(false);
    setIsMobileNavigationOpen(false);
  }, [location.pathname]);

  const toggleLeftWorkspacePanel = useEffectEvent(() => {
    setChatWorkspacePanels((current) => ({
      leftCollapsed: !current.leftCollapsed,
    }));
  });

  useEffect(() => {
    if (!isChatRoute || isMobile) {
      return;
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (
        !(event.metaKey || event.ctrlKey) ||
        event.key.toLowerCase() !== "b" ||
        event.altKey ||
        event.shiftKey ||
        isEditableHotkeyTarget(event.target)
      ) {
        return;
      }

      event.preventDefault();
      toggleLeftWorkspacePanel();
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [isChatRoute, isMobile, toggleLeftWorkspacePanel]);

  const createSessionMutation = useMutation({
    mutationFn: createChatSession,
    onSuccess: (session) => {
      clearComposer(session.id);
      queryClient.setQueryData(
        queryKeys.chat.sessions,
        (current: Array<{ id: number; title: string | null }> | undefined) => {
          const nextSessions = current ?? [];

          return [session, ...nextSessions.filter((item) => item.id !== session.id)];
        },
      );
      void navigate(buildChatSessionPath(session.id));
    },
  });

  const handleLogout = async () => {
    try {
      await logout();
    } finally {
      await logoutSession(queryClient);
    }
  };

  const handleCreateSession = async () => {
    await createSessionMutation.mutateAsync({});
  };

  const chatDesktopGridTemplate = useMemo(
    () => buildChatDesktopGridTemplate(chatWorkspacePanels),
    [chatWorkspacePanels],
  );

  if (isChatRoute) {
    return (
      <main className="min-h-[100dvh] bg-background/95 px-3.5 py-3.5 text-foreground sm:px-4 sm:py-4">
        {isMobile ? (
          <div className="flex min-h-[calc(100dvh-1.75rem)] flex-col gap-2.5">
            <div className="surface-elevated grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-2 rounded-xl px-2 py-1.5 transition-[background-color,border-color,box-shadow] duration-200">
              <Sheet onOpenChange={setIsMobileNavigationOpen} open={isMobileNavigationOpen}>
                <SheetTrigger
                  render={
                    <Button aria-label={t("mobileSessionsAction")} size="icon-sm" variant="ghost" />
                  }
                >
                  <PanelLeftIcon />
                </SheetTrigger>
                <SheetContent
                  className="w-[88vw] max-w-sm bg-background/96 p-0"
                  closeLabel={t("closeAction", { ns: "common" })}
                  side="left"
                >
                  <SheetHeader className="border-b border-border/60">
                    <SheetTitle>{t("mobileNavigationTitle", { ns: "common" })}</SheetTitle>
                    <SheetDescription>
                      {t("mobileNavigationDescription", { ns: "common" })}
                    </SheetDescription>
                  </SheetHeader>
                  <div className="min-h-0 flex-1 px-4 pb-4 pt-3">
                    <ChatSidebar
                      accountMenuCompact
                      accountMenuPortalled={false}
                      className="h-full"
                      onCreateSession={handleCreateSession}
                      createSessionPending={createSessionMutation.isPending}
                      onNavigate={() => setIsMobileNavigationOpen(false)}
                      onLogout={handleLogout}
                      onSelectSession={() => setIsMobileNavigationOpen(false)}
                      pathname={location.pathname}
                      searchValue={searchValue}
                      setSearchValue={setSearchValue}
                      user={user}
                    />
                  </div>
                </SheetContent>
              </Sheet>

              <div className="min-w-0 px-1 text-center">
                <p className="truncate text-sm font-medium text-foreground/92">
                  {t(getWorkspaceLabelKey(location.pathname), { ns: "common" })}
                </p>
              </div>

              <Sheet onOpenChange={setIsMobileContextOpen} open={isMobileContextOpen}>
                <SheetTrigger
                  render={
                    <Button aria-label={t("mobileContextAction")} size="icon-sm" variant="ghost" />
                  }
                >
                  <PanelRightIcon />
                </SheetTrigger>
                <SheetContent
                  className="w-[88vw] max-w-sm bg-background/96 p-0"
                  closeLabel={t("closeAction", { ns: "common" })}
                  side="right"
                >
                  <SheetHeader className="border-b border-border/60">
                    <SheetTitle>{t("mobileContextTitle")}</SheetTitle>
                    <SheetDescription>{t("mobileContextDescription")}</SheetDescription>
                  </SheetHeader>
                  <div className="min-h-0 flex-1 px-4 pb-4 pt-3">
                    <ChatResourcePanel className="h-full" />
                  </div>
                </SheetContent>
              </Sheet>
            </div>

            <div className="surface-elevated flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden rounded-2xl">
              <Outlet />
            </div>
          </div>
        ) : (
          <div
            className="surface-elevated grid h-[calc(100dvh-1.75rem)] min-h-[calc(100dvh-1.75rem)] min-w-0 overflow-hidden rounded-2xl transition-[grid-template-columns] duration-250 ease-out"
            data-testid="chat-desktop-layout"
            style={{
              height: "calc(100vh - 1.75rem)",
              minHeight: "calc(100vh - 1.75rem)",
              gridTemplateColumns: chatDesktopGridTemplate,
            }}
          >
            <div
              className="min-h-0 min-w-0 overflow-hidden border-r border-border/50 bg-sidebar/34"
              data-testid="chat-desktop-workspace-rail"
            >
              <WorkspaceRail onLogout={handleLogout} pathname={location.pathname} user={user} />
            </div>
            <div
              className={cn(
                "min-h-0 min-w-0 overflow-hidden bg-sidebar/56",
                chatWorkspacePanels.leftCollapsed ? "" : "border-r border-border/60",
              )}
            >
              {chatWorkspacePanels.leftCollapsed ? null : (
                <ChatSidebar
                  className="h-full"
                  onCreateSession={handleCreateSession}
                  createSessionPending={createSessionMutation.isPending}
                  onLogout={handleLogout}
                  pathname={location.pathname}
                  searchValue={searchValue}
                  showAccountMenu={false}
                  showWorkspaceBrand={false}
                  showWorkspaceModeSwitcher={false}
                  surface="embedded"
                  setSearchValue={setSearchValue}
                  user={user}
                />
              )}
            </div>
            <div className="relative flex h-full min-h-0 min-w-0 flex-col overflow-visible bg-transparent">
              <div
                className="relative flex h-full min-h-0 min-w-0 flex-col overflow-hidden bg-transparent"
                id="main-content"
              >
                <Outlet />
                {chatWorkspacePanels.leftCollapsed ? (
                  <CollapsedEdgeHandle
                    buttonLabel={t("expandSessionSidebarAction")}
                    onExpand={() => setChatWorkspacePanels({ leftCollapsed: false })}
                    side="left"
                  />
                ) : null}
              </div>
            </div>
            <div className="min-h-0 min-w-0 overflow-hidden border-l border-border/60 bg-background/34">
              <ChatResourcePanel className="h-full" surface="embedded" />
            </div>
          </div>
        )}
      </main>
    );
  }

  return (
    <main className="min-h-[100dvh] bg-background/95 px-3.5 py-3.5 text-foreground sm:px-4 sm:py-4">
      {isMobile ? (
        <div className="flex min-h-[calc(100dvh-1.75rem)] flex-col gap-2 sm:gap-2.5">
          <div className="surface-elevated grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-2 rounded-xl px-2 py-1.5 transition-[background-color,border-color,box-shadow] duration-200">
            <Sheet onOpenChange={setIsMobileNavigationOpen} open={isMobileNavigationOpen}>
              <SheetTrigger
                render={
                  <Button
                    aria-label={t("mobileNavigationAction", { ns: "common" })}
                    size="icon-sm"
                    variant="ghost"
                  />
                }
              >
                <PanelLeftIcon />
              </SheetTrigger>
              <SheetContent
                className="w-[88vw] max-w-sm bg-background/96 p-0"
                closeLabel={t("closeAction", { ns: "common" })}
                side="left"
              >
                <SheetHeader className="border-b border-border/60">
                  <SheetTitle>{t("mobileNavigationTitle", { ns: "common" })}</SheetTitle>
                  <SheetDescription>
                    {t("mobileNavigationDescription", { ns: "common" })}
                  </SheetDescription>
                </SheetHeader>
                <div className="min-h-0 flex-1 px-4 pb-4 pt-3">
                  <StandardSidebar
                    accountMenuCompact
                    accountMenuPortalled={false}
                    className="h-full"
                    onLogout={handleLogout}
                    onNavigate={() => setIsMobileNavigationOpen(false)}
                    pathname={location.pathname}
                    surface="embedded"
                    user={user}
                  />
                </div>
              </SheetContent>
            </Sheet>

            <div className="min-w-0 px-1 text-center">
              <p className="truncate text-sm font-medium text-foreground/92">
                {t(getWorkspaceLabelKey(location.pathname), { ns: "common" })}
              </p>
            </div>

            <div className="size-11 shrink-0" />
          </div>

          <div
            className="surface-elevated flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden rounded-xl"
            id="main-content"
          >
            <Outlet />
          </div>
        </div>
      ) : (
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
            <WorkspaceRail onLogout={handleLogout} pathname={location.pathname} user={user} />
          </div>
          {isSettingsRoute ? (
            <div className="min-h-0 min-w-0 overflow-hidden border-r border-border/50 bg-sidebar/56">
              <StandardSidebar
                mode="settings"
                onLogout={handleLogout}
                pathname={location.pathname}
                surface="embedded"
                user={user}
              />
            </div>
          ) : null}
          <ScrollArea
            className="flex min-h-0 min-w-0 flex-col overflow-y-auto overscroll-contain bg-background/34"
            contentClassName="min-w-0 w-full"
            data-testid="standard-desktop-content-rail"
            hideScrollbar
            viewportClassName="overflow-x-hidden"
            viewportStyle={{ overflowX: "hidden" }}
          >
            <Outlet />
          </ScrollArea>
        </div>
      )}
    </main>
  );
}
