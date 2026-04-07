/**
 * @file 应用壳层布局布局模块。
 */

import { useEffect, useEffectEvent, useMemo, useRef, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { PanelLeftIcon, PanelRightIcon } from "lucide-react";

import { Button } from "@/components/ui/button";
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
import { getWorkspaceLabelKey } from "@/features/workspace/workspace-links";
import { queryKeys } from "@/lib/api/query-keys";
import { clearPendingThemeSync, resolvePendingThemeSync } from "@/lib/config/theme-sync-storage";
import { useIsMobile } from "@/lib/hooks/use-mobile";
import type { AppUser } from "@/lib/api/client";
import { logoutSession } from "@/lib/auth/session-manager";
import { cn } from "@/lib/utils";
import { useTheme } from "@/providers/theme-provider";
import { useChatUiStore } from "@/features/chat/store/chat-ui-store";
import {
  buildChatDesktopGridTemplate,
  type ChatWorkspacePanelsState,
} from "./app-shell-layout-panels";

const DEFAULT_CHAT_WORKSPACE_PANELS: ChatWorkspacePanelsState = {
  leftCollapsed: false,
  rightCollapsed: false,
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
  const { setTheme } = useTheme();
  const clearAttachments = useChatUiStore((state) => state.clearAttachments);
  const setDraft = useChatUiStore((state) => state.setDraft);
  const pendingThemeRef = useRef<AppUser["theme_preference"] | null>(null);
  const pendingThemeBaseRef = useRef<AppUser["theme_preference"] | null>(null);

  useEffect(() => {
    const pendingThemeSync = resolvePendingThemeSync(user.theme_preference);

    if (pendingThemeSync.shouldClearPendingTheme) {
      clearPendingThemeSync();
      pendingThemeRef.current = null;
      pendingThemeBaseRef.current = null;
      setTheme(pendingThemeSync.resolvedTheme);
      return;
    }

    if (pendingThemeRef.current !== pendingThemeSync.pendingTheme) {
      pendingThemeRef.current = pendingThemeSync.pendingTheme;
      pendingThemeBaseRef.current = user.theme_preference;
      setTheme(pendingThemeSync.resolvedTheme);
      return;
    }

    if (pendingThemeBaseRef.current === user.theme_preference) {
      setTheme(pendingThemeSync.resolvedTheme);
      return;
    }

    clearPendingThemeSync();
    pendingThemeRef.current = null;
    pendingThemeBaseRef.current = null;
    setTheme(user.theme_preference);
  }, [setTheme, user.theme_preference]);

  useEffect(() => {
    setIsMobileContextOpen(false);
    setIsMobileNavigationOpen(false);
  }, [location.pathname]);

  const toggleLeftWorkspacePanel = useEffectEvent(() => {
    setChatWorkspacePanels((current) => ({
      leftCollapsed: !current.leftCollapsed,
      rightCollapsed: current.rightCollapsed,
    }));
  });

  const collapseRightWorkspacePanel = useEffectEvent(() => {
    setChatWorkspacePanels((current) => ({
      leftCollapsed: current.leftCollapsed,
      rightCollapsed: true,
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
      setDraft(session.id, "");
      clearAttachments(session.id);
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
      <main className="min-h-[100dvh] bg-background/95 px-4 py-4 text-foreground">
        {isMobile ? (
          // 移动端：统一间距节奏
          <div className="flex min-h-[calc(100dvh-2rem)] flex-col gap-3">
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
                  <SheetHeader className="border-b border-border/70">
                    <SheetTitle>{t("mobileNavigationTitle", { ns: "common" })}</SheetTitle>
                    <SheetDescription>
                      {t("mobileNavigationDescription", { ns: "common" })}
                    </SheetDescription>
                  </SheetHeader>
                  <div className="min-h-0 flex-1 px-4 pb-4 pt-3">
                    <ChatSidebar
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
                <p className="truncate text-sm font-medium text-foreground">
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
                  <SheetHeader className="border-b border-border/70">
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
            className="surface-elevated grid h-[calc(100dvh-2rem)] min-h-[calc(100dvh-2rem)] min-w-0 overflow-hidden rounded-3xl transition-[grid-template-columns] duration-200 ease-out"
            data-testid="chat-desktop-layout"
            style={{
              height: "calc(100vh - 2rem)",
              minHeight: "calc(100vh - 2rem)",
              gridTemplateColumns: chatDesktopGridTemplate,
            }}
          >
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
                    onExpand={() =>
                      setChatWorkspacePanels((current) => ({
                        leftCollapsed: false,
                        rightCollapsed: current.rightCollapsed,
                      }))
                    }
                    side="left"
                  />
                ) : null}
                {chatWorkspacePanels.rightCollapsed ? (
                  <CollapsedEdgeHandle
                    buttonLabel={t("expandContextSidebarAction", { ns: "chat" })}
                    onExpand={() =>
                      setChatWorkspacePanels((current) => ({
                        leftCollapsed: current.leftCollapsed,
                        rightCollapsed: false,
                      }))
                    }
                    side="right"
                  />
                ) : null}
              </div>
            </div>
            <div
              className={cn(
                "min-h-0 min-w-0 overflow-hidden bg-background/34",
                chatWorkspacePanels.rightCollapsed ? "" : "border-l border-border/60",
              )}
            >
              {chatWorkspacePanels.rightCollapsed ? null : (
                <ChatResourcePanel
                  className="h-full"
                  headerAccessory={
                    <Button
                      aria-label={t("collapseContextSidebarAction", { ns: "chat" })}
                      onClick={() => collapseRightWorkspacePanel()}
                      size="sm"
                      type="button"
                      variant="ghost"
                    >
                      {t("collapseContextSidebarAction", { ns: "chat" })}
                    </Button>
                  }
                  surface="embedded"
                />
              )}
            </div>
          </div>
        )}
      </main>
    );
  }

  return (
    <main className="min-h-[100dvh] bg-background/95 px-4 py-4 text-foreground">
      {isMobile ? (
        <div className="flex min-h-[calc(100dvh-2rem)] flex-col gap-2.5 sm:gap-3">
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
                <SheetHeader className="border-b border-border/70">
                  <SheetTitle>{t("mobileNavigationTitle", { ns: "common" })}</SheetTitle>
                  <SheetDescription>
                    {t("mobileNavigationDescription", { ns: "common" })}
                  </SheetDescription>
                </SheetHeader>
                <div className="min-h-0 flex-1 px-4 pb-4 pt-3">
                  <div data-testid="mobile-navigation-surface">
                    <StandardSidebar
                      className="h-full"
                      onNavigate={() => setIsMobileNavigationOpen(false)}
                      onLogout={handleLogout}
                      pathname={location.pathname}
                      user={user}
                    />
                  </div>
                </div>
              </SheetContent>
            </Sheet>

            <div className="min-w-0 px-1 text-center">
              <p className="truncate text-sm font-medium text-foreground">
                {t(getWorkspaceLabelKey(location.pathname), { ns: "common" })}
              </p>
            </div>

            <div className="size-11 shrink-0" />
          </div>

          <div
            className="surface-elevated flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden rounded-2xl"
            id="main-content"
          >
            <Outlet />
          </div>
        </div>
      ) : (
        // 桌面端标准布局：优化侧边栏比例
        <div
          className="surface-elevated grid min-h-[calc(100dvh-2rem)] gap-0 overflow-hidden rounded-3xl lg:grid-cols-[260px_minmax(0,1fr)]"
          data-testid="standard-desktop-layout"
        >
          <div
            className="min-h-0 min-w-0 overflow-hidden border-r border-border/60 bg-sidebar/56"
            data-testid="standard-desktop-sidebar-rail"
          >
            <StandardSidebar
              onLogout={handleLogout}
              pathname={location.pathname}
              surface="embedded"
              user={user}
            />
          </div>
          <div
            className="flex min-h-0 min-w-0 flex-col bg-background/34"
            data-testid="standard-desktop-content-rail"
            id="main-content"
          >
            <Outlet />
          </div>
        </div>
      )}
    </main>
  );
}
