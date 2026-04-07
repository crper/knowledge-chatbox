/**
 * @file 工作区相关界面组件模块。
 */

import { useCallback, memo, useDeferredValue, useMemo, useRef, useState } from "react";
import type { FormEvent, KeyboardEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useVirtualizer } from "@tanstack/react-virtual";
import { PencilLineIcon, PlusIcon, SearchIcon, Trash2Icon } from "lucide-react";
import { useTranslation } from "react-i18next";
import { z } from "zod";

import { BrandMark } from "@/components/shared/brand-mark";
import { NavLink, useNavigate } from "@/lib/app-router";
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
import { useAppForm } from "@/lib/form/use-app-form";
import { handleFormSubmitEvent } from "@/lib/forms";
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

const sessionRenameSchema = z.object({
  title: z.string(),
});

type SessionRowProps = {
  activeSessionId: number | null;
  editingSessionId: number | null;
  isRenamePending: boolean;
  onBeginRename: (sessionId: number, title: string | null) => void;
  onDeleteSession: (sessionId: number) => void;
  onRenameInputKeyDown: (event: KeyboardEvent<HTMLInputElement>) => void;
  onRenameSubmit: (sessionId: number) => (event: FormEvent<HTMLFormElement>) => void;
  onSelectSession?: () => void;
  renameForm: any;
  session: { id: number; title: string | null };
  sessionTitleFallback: string;
  t: ReturnType<typeof useTranslation>["t"];
};

const SessionRow = memo(function SessionRow({
  activeSessionId,
  editingSessionId,
  isRenamePending,
  onBeginRename,
  onDeleteSession,
  onRenameInputKeyDown,
  onRenameSubmit,
  onSelectSession,
  renameForm,
  session,
  sessionTitleFallback,
  t,
}: SessionRowProps) {
  const isEditing = editingSessionId === session.id;

  return (
    <div data-testid={`chat-session-actions-${session.id}`}>
      {isEditing ? (
        <form
          className="surface-light flex items-center gap-2 rounded-xl p-1"
          data-testid={`chat-session-row-${session.id}`}
          noValidate
          onSubmit={onRenameSubmit(session.id)}
        >
          <renameForm.Field name="title">
            {(field: any) => (
              <SidebarInput
                aria-label={t("sessionRenameLabel", { ns: "chat" })}
                className="h-9 rounded-lg bg-background"
                disabled={isRenamePending}
                name={field.name}
                onChange={(event) => field.handleChange(event.target.value)}
                onKeyDown={onRenameInputKeyDown}
                value={field.state.value}
              />
            )}
          </renameForm.Field>
          <Button
            aria-label={t("saveSessionRenameAction", { ns: "chat" })}
            className="shrink-0"
            disabled={isRenamePending}
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
            className={cn(
              "h-auto min-w-0 flex-1 rounded-xl px-3 py-3 text-left transition-[background-color,color] duration-180 ease-out",
              "data-[active=true]:bg-secondary/70 data-[active=true]:text-foreground",
              "data-[active=false]:text-foreground/82 data-[active=false]:hover:bg-background/72 data-[active=false]:hover:text-foreground",
            )}
            isActive={session.id === activeSessionId}
            render={
              <NavLink onClick={() => onSelectSession?.()} to={buildChatSessionPath(session.id)} />
            }
          >
            <span className="min-w-0 truncate">
              {resolveSessionTitle(session.title, sessionTitleFallback)}
            </span>
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
              onClick={() => onBeginRename(session.id, session.title)}
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
              onClick={() => onDeleteSession(session.id)}
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
});

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
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const activeSessionId = parseChatSessionIdFromPathname(pathname);
  const deferredSearchValue = useDeferredValue(searchValue);
  const sessionTitleFallback = t("sessionTitleFallback", { ns: "chat" });
  const renameForm = useAppForm({
    defaultValues: {
      title: "",
    },
    onSubmit: async () => {},
    schema: sessionRenameSchema,
  });

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

  const beginRename = useCallback(
    (sessionId: number, title: string | null) => {
      setEditingSessionId(sessionId);
      renameForm.reset({ title: title ?? "" });
    },
    [renameForm],
  );

  const submitRename = async (sessionId: number, title: string) => {
    if (renameSessionMutation.isPending) {
      return;
    }

    const normalizedTitle = title.trim();
    try {
      await renameSessionMutation.mutateAsync({
        sessionId,
        title: normalizedTitle ? normalizedTitle : null,
      });
      queryClient.setQueryData(
        queryKeys.chat.sessions,
        (current: Array<{ id: number; title: string | null }> | undefined) =>
          current?.map((session) =>
            session.id === sessionId
              ? { ...session, title: normalizedTitle ? normalizedTitle : null }
              : session,
          ) ?? current,
      );
      setEditingSessionId(null);
      renameForm.reset({ title: "" });
    } catch {}
  };

  const handleDeleteSession = useCallback(
    (sessionId: number) => {
      void deleteSessionMutation.mutateAsync(sessionId);
    },
    [deleteSessionMutation],
  );

  const handleRenameSubmit = useCallback(
    (sessionId: number) => (event: FormEvent<HTMLFormElement>) => {
      const titleInput = event.currentTarget.querySelector("input");
      const title = titleInput?.value ?? "";
      void handleFormSubmitEvent(event, () => submitRename(sessionId, title));
    },
    [submitRename],
  );

  const handleRenameInputKeyDown = useCallback((event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key !== "Enter" || isInputComposing(event)) {
      return;
    }

    event.preventDefault();
    event.currentTarget.form?.requestSubmit();
  }, []);

  const handleBeginRename = useCallback(
    (sessionId: number, title: string | null) => {
      beginRename(sessionId, title);
    },
    [beginRename],
  );

  const handleCreateSession = useCallback(() => {
    void onCreateSession();
  }, [onCreateSession]);

  const handleSetSearchValue = useCallback(
    (value: string) => {
      setSearchValue(value);
    },
    [setSearchValue],
  );

  const handleClearSearch = useCallback(() => {
    setSearchValue("");
  }, [setSearchValue]);

  const SESSION_ROW_HEIGHT = 72;
  const parentRef = useRef<HTMLDivElement>(null);
  const virtualizer = useVirtualizer({
    count: filteredSessions.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => SESSION_ROW_HEIGHT,
    overscan: 5,
  });

  return (
    <SidebarProvider className="h-full min-h-0 w-full">
      <Sidebar
        aria-label={t("workspaceSidebarLabel", { ns: "common" })}
        className={cn(
          surface === "embedded"
            ? "h-full w-full bg-transparent px-5 py-5"
            : "surface-panel-subtle h-full w-full rounded-2xl px-4 py-4",
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

          <SidebarGroup className="surface-light gap-3 rounded-2xl p-3.5">
            <SidebarGroupContent>
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-ui-title">{t("sessionListTitle", { ns: "chat" })}</p>
                  <p className="text-ui-caption text-muted-foreground">
                    {t("workspaceChatHint", { ns: "common" })}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    aria-label={t("newSessionAction", { ns: "chat" })}
                    disabled={createSessionPending}
                    onClick={handleCreateSession}
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
                  onChange={(event) => handleSetSearchValue(event.target.value)}
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
                  <Button onClick={handleClearSearch} size="sm" type="button" variant="outline">
                    {t("clearSearchAction", { ns: "chat" })}
                  </Button>
                ) : null}
              </Empty>
            ) : (
              <div
                ref={parentRef}
                className="min-h-0 h-full overflow-auto pr-3"
                data-testid="chat-sidebar-virtuoso"
                style={{ contain: "strict" }}
              >
                <div
                  style={{
                    height: `${virtualizer.getTotalSize()}px`,
                    width: "100%",
                    position: "relative",
                  }}
                >
                  {virtualizer.getVirtualItems().map((virtualItem) => {
                    const session = filteredSessions[virtualItem.index];
                    return (
                      <div
                        key={session?.id ?? `probe-session-${virtualItem.index}`}
                        data-index={virtualItem.index}
                        style={{
                          position: "absolute",
                          top: 0,
                          left: 0,
                          width: "100%",
                          height: `${virtualItem.size}px`,
                          transform: `translateY(${virtualItem.start}px)`,
                        }}
                      >
                        {session ? (
                          <SessionRow
                            activeSessionId={activeSessionId}
                            editingSessionId={editingSessionId}
                            isRenamePending={renameSessionMutation.isPending}
                            onBeginRename={handleBeginRename}
                            onDeleteSession={handleDeleteSession}
                            onRenameInputKeyDown={handleRenameInputKeyDown}
                            onRenameSubmit={handleRenameSubmit}
                            onSelectSession={onSelectSession}
                            renameForm={renameForm}
                            session={session}
                            sessionTitleFallback={sessionTitleFallback}
                            t={t}
                          />
                        ) : (
                          renderSessionProbeRow()
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
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
