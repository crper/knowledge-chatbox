/**
 * @file 应用壳层布局布局模块。
 */

import { useTranslation } from "react-i18next";
import { Outlet, useLocation } from "@/lib/app-router";
import { ChatResourcePanel } from "@/features/workspace/components/chat-resource-panel";
import { ChatSidebar } from "@/features/workspace/components/chat-sidebar";
import { StandardSidebar } from "@/features/workspace/components/standard-sidebar";
import { WorkspaceRail } from "@/features/workspace/components/workspace-rail";
import { getWorkspaceLabelKey } from "@/features/workspace/workspace-links";
import type { AppUser } from "@/lib/api/client";
import { useThemeSyncService } from "@/providers/theme-sync-service";
import {
  ChatDesktopShell,
  ChatMobileShell,
  StandardDesktopShell,
  StandardMobileShell,
} from "./app-shell-layout-shells";
import { useAppShellLayoutController } from "./use-app-shell-layout-controller";

/**
 * 描述应用壳层布局结果。
 */
export function AppShellLayout({ user }: { user: AppUser }) {
  const { t } = useTranslation(["chat", "common"]);
  const location = useLocation();
  useThemeSyncService({ user });

  const controller = useAppShellLayoutController();

  if (controller.isChatRoute) {
    return (
      <main className="min-h-[100dvh] bg-background/95 px-3.5 py-3.5 text-foreground sm:px-4 sm:py-4">
        {controller.isMobile ? (
          <ChatMobileShell
            closeActionLabel={t("closeAction", { ns: "common" })}
            contextActionLabel={t("mobileContextAction")}
            contextDescription={t("mobileContextDescription")}
            contextOpen={controller.isMobileContextOpen}
            contextPanel={<ChatResourcePanel className="h-full" />}
            contextTitle={t("mobileContextTitle")}
            navigation={
              <ChatSidebar
                accountMenuCompact
                accountMenuPortalled={false}
                className="h-full"
                createSessionPending={controller.createSessionPending}
                onCreateSession={controller.handleCreateSession}
                onLogout={controller.handleLogout}
                onNavigate={() => controller.setIsMobileNavigationOpen(false)}
                onSelectSession={() => controller.setIsMobileNavigationOpen(false)}
                pathname={location.pathname}
                searchValue={controller.searchValue}
                setSearchValue={controller.setSearchValue}
                user={user}
              />
            }
            navigationActionLabel={t("mobileSessionsAction")}
            navigationDescription={t("mobileNavigationDescription", { ns: "common" })}
            navigationOpen={controller.isMobileNavigationOpen}
            navigationTitle={t("mobileNavigationTitle", { ns: "common" })}
            onContextOpenChange={controller.setIsMobileContextOpen}
            onNavigationOpenChange={controller.setIsMobileNavigationOpen}
            workspaceLabel={t(getWorkspaceLabelKey(location.pathname), { ns: "common" })}
          >
            <Outlet />
          </ChatMobileShell>
        ) : (
          <ChatDesktopShell
            contextPanel={<ChatResourcePanel className="h-full" surface="embedded" />}
            expandSidebarLabel={t("expandSessionSidebarAction")}
            gridTemplate={controller.chatDesktopGridTemplate}
            onExpandSidebar={controller.expandLeftSidebar}
            sidebar={
              <ChatSidebar
                className="h-full"
                createSessionPending={controller.createSessionPending}
                onCreateSession={controller.handleCreateSession}
                onLogout={controller.handleLogout}
                pathname={location.pathname}
                searchValue={controller.searchValue}
                setSearchValue={controller.setSearchValue}
                showAccountMenu={false}
                showWorkspaceBrand={false}
                showWorkspaceModeSwitcher={false}
                surface="embedded"
                user={user}
              />
            }
            sidebarCollapsed={controller.chatWorkspacePanels.leftCollapsed}
            workspaceRail={
              <WorkspaceRail
                onLogout={controller.handleLogout}
                pathname={location.pathname}
                user={user}
              />
            }
          >
            <Outlet />
          </ChatDesktopShell>
        )}
      </main>
    );
  }

  return (
    <main className="min-h-[100dvh] bg-background/95 px-3.5 py-3.5 text-foreground sm:px-4 sm:py-4">
      {controller.isMobile ? (
        <StandardMobileShell
          closeActionLabel={t("closeAction", { ns: "common" })}
          navigation={
            <StandardSidebar
              accountMenuCompact
              accountMenuPortalled={false}
              className="h-full"
              onLogout={controller.handleLogout}
              onNavigate={() => controller.setIsMobileNavigationOpen(false)}
              pathname={location.pathname}
              surface="embedded"
              user={user}
            />
          }
          navigationActionLabel={t("mobileNavigationAction", { ns: "common" })}
          navigationDescription={t("mobileNavigationDescription", { ns: "common" })}
          navigationOpen={controller.isMobileNavigationOpen}
          navigationTitle={t("mobileNavigationTitle", { ns: "common" })}
          onNavigationOpenChange={controller.setIsMobileNavigationOpen}
          workspaceLabel={t(getWorkspaceLabelKey(location.pathname), { ns: "common" })}
        >
          <Outlet />
        </StandardMobileShell>
      ) : (
        <StandardDesktopShell
          isSettingsRoute={controller.isSettingsRoute}
          sidebar={
            <StandardSidebar
              mode="settings"
              onLogout={controller.handleLogout}
              pathname={location.pathname}
              surface="embedded"
              user={user}
            />
          }
          workspaceRail={
            <WorkspaceRail
              onLogout={controller.handleLogout}
              pathname={location.pathname}
              user={user}
            />
          }
        >
          <Outlet />
        </StandardDesktopShell>
      )}
    </main>
  );
}
