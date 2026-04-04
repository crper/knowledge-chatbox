/**
 * @file 工作区相关界面组件模块。
 */

import { useDeferredValue, useMemo, useState } from "react";
import type { FormEvent, KeyboardEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { PencilLineIcon, PlusIcon, SearchIcon, Trash2Icon } from "lucide-react";
import { useTranslation } from "react-i18next";
import { NavLink, useNavigate } from "react-router-dom";
import { Virtuoso } from "react-virtuoso";

import { BrandMark } from "@/components/shared/brand-mark";
import { Button } from "@/components/ui/button";
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from "@/components/ui/empty";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarHeader,
  SidebarInput,
  SidebarMenuButton,
  SidebarProvider,
  SidebarSeparator,
} from "@/components/ui/sidebar";
import { chatSessionsQueryOptions } from "@/features/chat/api/chat-query";
import { deleteChatSession, renameChatSession } from "@/features/chat/api/chat";
import {
  buildChatSessionPath,
  parseChatSessionIdFromPathname,
} from "@/features/chat/utils/chat-session-route";
import type { AppUser } from "@/lib/api/client";
import { queryKeys } from "@/lib/api/query-keys";
import { cn } from "@/lib/utils";
import { WorkspaceModeSwitcher } from "./standard-sidebar";
import { WorkspaceAccountMenu } from "./workspace-account-menu";

function resolveSessionTitle(title: string | null, fallbackTitle: string) {
  const normalizedTitle = title?.trim();
  return normalizedTitle ? normalizedTitle : fallbackTitle;
}

function renderSessionProbeRow() {
  return <div aria-hidden="true" className="h-[72px] opacity-0 pointer-events-none" />;
}

function isInputComposing(event: KeyboardEvent<HTMLInputElement>) {
  return (
    event.nativeEvent.isComposing ||
    Boolean((event as KeyboardEvent<HTMLInputElement> & { isComposing?: boolean }).isComposing)
  );
}

/**
 * 渲染聊天侧栏。
 */
export function ChatSidebar({
  className,
  onCreateSession,
  createSessionPending = false,
  onNavigate,
  onLogout,
  onSelectSession,
  pathname,
  searchValue,
  surface = "default",
  setSearchValue,
  user,
}: {
  className?: string;
  onCreateSession: () => Promise<void>;
  createSessionPending?: boolean;
  onNavigate?: () => void;
  onLogout: () => Promise<void>;
  onSelectSession?: () => void;
  pathname: string;
  searchValue: string;
  surface?: "default" | "embedded";
  setSearchValue: (value: string) => void;
  user: AppUser;
}) {
  const { t } = useTranslation(["chat", "common"]);
  const [editingSessionId, setEditingSessionId] = useState<number | null>(null);
  const [editingTitle, setEditingTitle] = useState("");
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const activeSessionId = parseChatSessionIdFromPathname(pathname);
  const deferredSearchValue = useDeferredValue(searchValue);
  const sessionTitleFallback = t("sessionTitleFallback", { ns: "chat" });

  const sessionsQuery = useQuery(chatSessionsQueryOptions());
  const renameSessionMutation = useMutation({
    mutationFn: ({ sessionId, title }: { sessionId: number; title: string | null }) =>
      renameChatSession(sessionId, { title }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: queryKeys.chat.sessions });
    },
  });
  const deleteSessionMutation = useMutation({
    mutationFn: (sessionId: number) => deleteChatSession(sessionId),
    onSuccess: async (_, sessionId) => {
      await queryClient.invalidateQueries({ queryKey: queryKeys.chat.sessions });
      if (activeSessionId === sessionId) {
        const nextSession = sessions.find((session) => session.id !== sessionId) ?? null;
        void navigate(nextSession ? buildChatSessionPath(nextSession.id) : "/chat");
      }
    },
  });

  const sessions = Array.isArray(sessionsQuery.data) ? sessionsQuery.data : [];
  const filteredSessions = useMemo(() => {
    const keyword = deferredSearchValue.trim().toLowerCase();
    if (!keyword) {
      return sessions;
    }

    return sessions.filter((session) =>
      resolveSessionTitle(session.title, sessionTitleFallback).toLowerCase().includes(keyword),
    );
  }, [deferredSearchValue, sessionTitleFallback, sessions]);

  const beginRename = (sessionId: number, title: string | null) => {
    setEditingSessionId(sessionId);
    setEditingTitle(title ?? "");
  };

  const submitRename = async (sessionId: number) => {
    if (renameSessionMutation.isPending) {
      return;
    }

    const normalizedTitle = editingTitle.trim();
    try {
      await renameSessionMutation.mutateAsync({
        sessionId,
        title: normalizedTitle ? normalizedTitle : null,
      });
      setEditingSessionId(null);
      setEditingTitle("");
    } catch {
      // Keep the draft open so the user can retry after a failed rename.
    }
  };

  const handleDeleteSession = async (sessionId: number) => {
    await deleteSessionMutation.mutateAsync(sessionId);
  };

  const handleRenameSubmit = (sessionId: number) => (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    void submitRename(sessionId);
  };

  const handleRenameInputKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key !== "Enter" || isInputComposing(event)) {
      return;
    }

    event.preventDefault();
    event.currentTarget.form?.requestSubmit();
  };

  const renderSessionRow = (session: { id: number; title: string | null }) => {
    const renamePending = editingSessionId === session.id && renameSessionMutation.isPending;

    return (
      <div data-testid={`chat-session-actions-${session.id}`}>
        {editingSessionId === session.id ? (
          <form
            className="surface-outline flex items-center gap-2 rounded-xl p-1"
            data-testid={`chat-session-row-${session.id}`}
            noValidate
            onSubmit={handleRenameSubmit(session.id)}
          >
            <SidebarInput
              aria-label={t("sessionRenameLabel", { ns: "chat" })}
              className="h-9 rounded-lg bg-background"
              disabled={renamePending}
              onChange={(event) => setEditingTitle(event.target.value)}
              onKeyDown={handleRenameInputKeyDown}
              value={editingTitle}
            />
            <Button
              aria-label={t("saveSessionRenameAction", { ns: "chat" })}
              className="shrink-0"
              disabled={renamePending}
              size="sm"
              type="submit"
              variant="secondary"
            >
              {t("saveSessionRenameAction", { ns: "chat" })}
            </Button>
          </form>
        ) : (
          <div
            className="group/menu-item flex items-center gap-2"
            data-testid={`chat-session-row-${session.id}`}
          >
            <SidebarMenuButton
              asChild
              className={cn(
                "h-auto min-w-0 flex-1 rounded-xl px-3 py-3 text-left",
                "data-[active=true]:bg-secondary/70 data-[active=true]:text-foreground",
                "data-[active=false]:text-foreground/82 data-[active=false]:hover:bg-background/72 data-[active=false]:hover:text-foreground",
              )}
              isActive={session.id === activeSessionId}
            >
              <NavLink onClick={() => onSelectSession?.()} to={buildChatSessionPath(session.id)}>
                <span className="min-w-0 truncate">
                  {resolveSessionTitle(session.title, sessionTitleFallback)}
                </span>
              </NavLink>
            </SidebarMenuButton>
            <div
              className="flex shrink-0 select-none items-center gap-1"
              data-testid={`chat-session-action-rail-${session.id}`}
            >
              <Button
                aria-label={t("renameSessionAction", {
                  ns: "chat",
                  title: resolveSessionTitle(session.title, sessionTitleFallback),
                })}
                className="size-9 rounded-full"
                onClick={() => beginRename(session.id, session.title)}
                size="icon-sm"
                type="button"
                variant="ghost"
              >
                <PencilLineIcon />
              </Button>
              <Button
                aria-label={t("deleteSessionAction", {
                  ns: "chat",
                  title: resolveSessionTitle(session.title, sessionTitleFallback),
                })}
                className="size-9 rounded-full"
                onClick={() => void handleDeleteSession(session.id)}
                size="icon-sm"
                type="button"
                variant="ghost"
              >
                <Trash2Icon />
              </Button>
            </div>
          </div>
        )}
      </div>
    );
  };

  return (
    <SidebarProvider className="h-full min-h-0 w-full">
      <Sidebar
        aria-label={t("workspaceSidebarLabel", { ns: "common" })}
        className={cn(
          surface === "embedded"
            ? "h-full w-full bg-transparent px-5 py-5"
            : "surface-panel-subtle h-full w-full rounded-[1.5rem] px-4 py-4",
          className,
        )}
        collapsible="none"
        role="complementary"
      >
        <SidebarHeader className="gap-6 p-0">
          <BrandMark
            alt={t("workspaceLogoAlt", { ns: "common" })}
            subtitle={t("workspaceSubtitle", { ns: "common" })}
            title={t("workspaceTitle", { ns: "common" })}
          />

          <WorkspaceModeSwitcher onNavigate={onNavigate} pathname={pathname} />

          <SidebarGroup className="surface-outline gap-3 rounded-2xl p-3.5">
            <SidebarGroupContent>
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-sm font-medium">{t("sessionListTitle", { ns: "chat" })}</p>
                  <p className="text-xs text-muted-foreground">
                    {t("workspaceChatHint", { ns: "common" })}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    aria-label={t("newSessionAction", { ns: "chat" })}
                    disabled={createSessionPending}
                    onClick={() => void onCreateSession()}
                    size="icon-sm"
                    type="button"
                    variant="secondary"
                  >
                    <PlusIcon aria-hidden="true" />
                  </Button>
                </div>
              </div>
            </SidebarGroupContent>
            <SidebarGroupContent>
              <label className="relative block">
                <SearchIcon className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
                <SidebarInput
                  aria-label={t("searchSessionsLabel", { ns: "chat" })}
                  className="h-10 rounded-xl border-border/70 bg-background/62 pr-3 pl-9"
                  onChange={(event) => setSearchValue(event.target.value)}
                  placeholder={t("searchSessionsLabel", { ns: "chat" })}
                  value={searchValue}
                />
              </label>
            </SidebarGroupContent>
          </SidebarGroup>
        </SidebarHeader>

        <SidebarContent className="min-h-0 gap-0 overflow-hidden px-0 pt-6">
          <SidebarSeparator className="mx-0 mb-4" />
          <div className="min-h-0 flex-1">
            {filteredSessions.length === 0 ? (
              <Empty className="bg-background/40 px-4 py-8">
                <EmptyHeader>
                  <EmptyTitle>
                    {searchValue
                      ? t("sessionSearchEmptyTitle", { ns: "chat" })
                      : t("sessionListEmptyTitle", { ns: "chat" })}
                  </EmptyTitle>
                  <EmptyDescription>
                    {searchValue
                      ? t("sessionSearchEmptyDescription", { ns: "chat" })
                      : t("sessionListEmptyDescription", { ns: "chat" })}
                  </EmptyDescription>
                </EmptyHeader>
                {searchValue ? (
                  <Button
                    onClick={() => setSearchValue("")}
                    size="sm"
                    type="button"
                    variant="outline"
                  >
                    {t("clearSearchAction", { ns: "chat" })}
                  </Button>
                ) : null}
              </Empty>
            ) : (
              <Virtuoso
                className="min-h-0 h-full pr-3"
                computeItemKey={(index, session) => session?.id ?? `probe-session-${index}`}
                data={filteredSessions}
                fixedItemHeight={72}
                initialItemCount={Math.min(filteredSessions.length, 10)}
                itemContent={(_index, session) =>
                  session ? renderSessionRow(session) : renderSessionProbeRow()
                }
                style={{ height: "100%" }}
              />
            )}
          </div>
        </SidebarContent>

        <SidebarFooter className="mt-auto gap-3 p-0 pt-0">
          <SidebarSeparator className="mx-0" />
          <WorkspaceAccountMenu onLogout={onLogout} onNavigate={onNavigate} user={user} />
        </SidebarFooter>
      </Sidebar>
    </SidebarProvider>
  );
}
