/**
 * @file 应用壳层布局控制器 Hook。
 */

import { useEffect, useMemo, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useLocation, useNavigate } from "@tanstack/react-router";
import { logout } from "@/features/auth/api/auth";
import { createChatSession } from "@/features/chat/api/chat";
import { queryKeys } from "@/lib/api/query-keys";
import { useIsMobile } from "@/lib/hooks/use-mobile";
import { logoutSession } from "@/lib/auth/session-manager";
import { clearComposer } from "@/features/chat/utils/composer-transaction";
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
 * 描述应用壳层布局控制器返回值。
 */
export type AppShellLayoutController = {
  isChatRoute: boolean;
  isSettingsRoute: boolean;
  isMobile: boolean;
  searchValue: string;
  setSearchValue: (value: string) => void;
  isMobileNavigationOpen: boolean;
  setIsMobileNavigationOpen: (open: boolean) => void;
  isMobileContextOpen: boolean;
  setIsMobileContextOpen: (open: boolean) => void;
  chatDesktopGridTemplate: string;
  chatWorkspacePanels: ChatWorkspacePanelsState;
  expandLeftSidebar: () => void;
  handleCreateSession: () => Promise<void>;
  handleLogout: () => Promise<void>;
  createSessionPending: boolean;
};

/**
 * 应用壳层布局控制器 Hook。
 */
export function useAppShellLayoutController(): AppShellLayoutController {
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

  useEffect(() => {
    setIsMobileContextOpen(false);
    setIsMobileNavigationOpen(false);
  }, [location.pathname]);

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
      setChatWorkspacePanels((current) => ({
        leftCollapsed: !current.leftCollapsed,
      }));
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [isChatRoute, isMobile]);

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
      void navigate({ to: "/chat/$sessionId", params: { sessionId: String(session.id) } });
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

  const expandLeftSidebar = () => {
    setChatWorkspacePanels({ leftCollapsed: false });
  };

  return {
    isChatRoute,
    isSettingsRoute,
    isMobile,
    searchValue,
    setSearchValue,
    isMobileNavigationOpen,
    setIsMobileNavigationOpen,
    isMobileContextOpen,
    setIsMobileContextOpen,
    chatDesktopGridTemplate,
    chatWorkspacePanels,
    expandLeftSidebar,
    handleCreateSession,
    handleLogout,
    createSessionPending: createSessionMutation.isPending,
  };
}
