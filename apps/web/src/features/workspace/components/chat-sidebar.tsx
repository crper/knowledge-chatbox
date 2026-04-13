/**
 * @file 工作区相关界面组件模块。
 */

import { useCallback, memo, useDeferredValue, useMemo, useRef, useState } from "react";
import type { FormEvent, KeyboardEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useForm, revalidateLogic } from "@tanstack/react-form";
import type { ReactFormExtendedApi } from "@tanstack/react-form";
import { useVirtualizer } from "@tanstack/react-virtual";
import { MoreHorizontalIcon, PencilLineIcon, PlusIcon, SearchIcon, Trash2Icon } from "lucide-react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { z } from "zod";

import { BrandMark } from "@/components/shared/brand-mark";
import { Link, useNavigate } from "@tanstack/react-router";
import { isInputComposing } from "@/lib/dom";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from "@/components/ui/empty";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarInput,
  SidebarMenuButton,
  SidebarProvider,
  SidebarSeparator,
} from "@/components/ui/sidebar";
import { chatSessionsQueryOptions } from "@/features/chat/api/chat-query";
import { deleteChatSession, renameChatSession } from "@/features/chat/api/chat";
import { parseChatSessionPathname } from "@/lib/routes";
import type { AppUser } from "@/lib/api/client";
import { queryKeys } from "@/lib/api/query-keys";
import { zodFieldErrors } from "@/lib/forms";
import { useIsMobile } from "@/lib/hooks/use-mobile";
import { cn } from "@/lib/utils";
import { resolveSessionTitle } from "@/features/chat/utils/session-title";
import { WorkspaceModeSwitcher } from "./standard-sidebar";
import { WorkspaceAccountMenu } from "./workspace-account-menu";

function renderSessionProbeRow() {
  return <div aria-hidden="true" className="h-[52px] pointer-events-none opacity-0" />;
}

const sessionRenameSchema = z.object({
  title: z.string(),
});

type SessionRowProps = {
  activeSessionId: number | null;
  editingSessionId: number | null;
  isRenamePending: boolean;
  menuPortalContainer?: React.RefObject<HTMLElement | null>;
  onBeginRename: (sessionId: number, title: string | null) => void;
  onDeleteSession: (sessionId: number) => void;
  onRenameInputKeyDown: (event: KeyboardEvent<HTMLInputElement>) => void;
  onRenameSubmit: (sessionId: number) => (event: FormEvent<HTMLFormElement>) => void;
  onSelectSession?: () => void;
  renameForm: ReactFormExtendedApi<
    { title: string },
    any,
    any,
    any,
    any,
    any,
    any,
    any,
    any,
    any,
    any,
    any
  >;
  session: { id: number; title: string | null };
  sessionTitleFallback: string;
  t: ReturnType<typeof useTranslation>["t"];
};

const SessionRow = memo(function SessionRow({
  activeSessionId,
  editingSessionId,
  isRenamePending,
  menuPortalContainer,
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
  const isMobile = useIsMobile();

  return (
    <div data-testid={`chat-session-actions-${session.id}`}>
      {isEditing ? (
        <form
          className="surface-light flex items-center gap-1.5 rounded-xl p-1"
          data-testid={`chat-session-row-${session.id}`}
          noValidate
          onSubmit={onRenameSubmit(session.id)}
        >
          <renameForm.Field name="title">
            {(field: {
              handleChange: (value: string) => void;
              name: string;
              state: { meta: { errors: unknown[] }; value: string };
            }) => (
              <SidebarInput
                aria-label={t("sessionRenameLabel", { ns: "chat" })}
                className="h-8 rounded-lg border-border/50 bg-background/88 text-xs"
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
          className="group/menu-item flex items-center gap-1 rounded-xl transition-colors duration-150 ease-out"
          data-active={session.id === activeSessionId}
          data-testid={`chat-session-row-${session.id}`}
        >
          <SidebarMenuButton
            className={cn(
              "h-10 min-w-0 flex-1 rounded-xl border-transparent px-2.5 py-0 text-left shadow-none transition-[background-color,border-color,color,box-shadow] duration-180 ease-out",
              "data-[active=true]:border-border/60 data-[active=true]:bg-secondary/44 data-[active=true]:text-foreground data-[active=true]:font-medium data-[active=true]:shadow-[inset_0_1px_0_hsl(var(--surface-highlight)/0.14)]",
              "data-[active=false]:text-foreground/72 data-[active=false]:hover:bg-background/52 data-[active=false]:hover:text-foreground",
            )}
            isActive={session.id === activeSessionId}
            render={
              <Link
                onClick={() => onSelectSession?.()}
                to="/chat/$sessionId"
                params={{ sessionId: String(session.id) }}
              />
            }
            size="sm"
          >
            <span className="min-w-0 truncate text-[12px] tracking-[-0.01em]">
              {resolveSessionTitle(session.title, sessionTitleFallback)}
            </span>
          </SidebarMenuButton>
          <div
            className="flex shrink-0 select-none items-center opacity-100 md:opacity-0 md:transition-opacity md:duration-150 md:group-hover/menu-item:opacity-100 md:group-data-[active=true]/menu-item:opacity-100"
            data-testid={`chat-session-action-menu-${session.id}`}
          >
            <DropdownMenu>
              <DropdownMenuTrigger
                render={
                  <Button
                    aria-label={t("sessionMenuAction", {
                      ns: "chat",
                      title: resolveSessionTitle(session.title, sessionTitleFallback),
                    })}
                    className={cn(
                      "rounded-xl border border-transparent text-muted-foreground/86 transition-[background-color,border-color,color] duration-150",
                      "bg-background/42 hover:border-border/70 hover:bg-secondary/68 hover:text-foreground",
                      "md:bg-transparent md:hover:border-border/62 md:group-hover/menu-item:bg-secondary/58 md:group-hover/menu-item:text-foreground md:group-data-[active=true]/menu-item:bg-secondary/62",
                    )}
                    data-testid={`chat-session-menu-trigger-${session.id}`}
                    size="icon-sm"
                    type="button"
                    variant="ghost"
                  />
                }
              >
                <MoreHorizontalIcon className="size-3.5" />
              </DropdownMenuTrigger>
              <DropdownMenuContent
                align={isMobile ? "end" : "start"}
                alignOffset={isMobile ? -4 : 0}
                className={cn(
                  "rounded-2xl p-1.5",
                  isMobile
                    ? "w-[min(13.5rem,calc(100vw-3rem))]"
                    : "w-[min(15rem,calc(100vw-2rem))]",
                )}
                collisionPadding={isMobile ? 14 : 8}
                portalled={!isMobile}
                portalContainer={menuPortalContainer}
                side={isMobile ? "bottom" : "right"}
                sideOffset={isMobile ? 10 : 8}
              >
                <DropdownMenuLabel className="px-3 py-1.5 text-[11px] tracking-[0.06em]">
                  {t("sessionMenuLabel", { ns: "chat" })}
                </DropdownMenuLabel>
                <DropdownMenuItem
                  className="gap-2.5 rounded-xl px-3 py-2 text-sm"
                  onClick={() => onBeginRename(session.id, session.title)}
                >
                  <PencilLineIcon className="size-4 text-muted-foreground" />
                  <span>{t("renameSessionMenuItem", { ns: "chat" })}</span>
                </DropdownMenuItem>
                <DropdownMenuSeparator className="my-1.5" />
                <DropdownMenuItem
                  className="gap-2.5 rounded-xl px-3 py-2 text-sm"
                  onClick={() => onDeleteSession(session.id)}
                  variant="destructive"
                >
                  <Trash2Icon className="size-4" />
                  <span>{t("deleteAction", { ns: "chat" })}</span>
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
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
  accountMenuCompact = false,
  accountMenuPortalled = true,
  className,
  onCreateSession,
  createSessionPending = false,
  onNavigate,
  onLogout,
  onSelectSession,
  pathname,
  searchValue,
  showAccountMenu = true,
  showWorkspaceBrand = true,
  showWorkspaceModeSwitcher = true,
  surface = "default",
  setSearchValue,
  user,
}: {
  accountMenuCompact?: boolean;
  accountMenuPortalled?: boolean;
  className?: string;
  onCreateSession: () => Promise<void>;
  createSessionPending?: boolean;
  onNavigate?: () => void;
  onLogout: () => Promise<void>;
  onSelectSession?: () => void;
  pathname: string;
  searchValue: string;
  showAccountMenu?: boolean;
  showWorkspaceBrand?: boolean;
  showWorkspaceModeSwitcher?: boolean;
  surface?: "default" | "embedded";
  setSearchValue: (value: string) => void;
  user: AppUser;
}) {
  const { t } = useTranslation(["chat", "common"]);
  const [editingSessionId, setEditingSessionId] = useState<number | null>(null);
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const activeSessionId = parseChatSessionPathname(pathname);
  const deferredSearchValue = useDeferredValue(searchValue);
  const sessionTitleFallback = t("sessionTitleFallback", { ns: "chat" });
  const renameForm = useForm({
    defaultValues: {
      title: "",
    },
    validators: {
      onChange: ({ value }) => zodFieldErrors(sessionRenameSchema, value),
    },
    validationLogic: revalidateLogic({ mode: "submit", modeAfterSubmission: "blur" }),
    onSubmit: async () => {},
  });

  const sessionsQuery = useQuery(chatSessionsQueryOptions());
  const renameSessionMutation = useMutation({
    mutationFn: ({ sessionId, title }: { sessionId: number; title: string | null }) =>
      renameChatSession(sessionId, { title }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: queryKeys.chat.sessions });
    },
    onError: () => {
      toast.error(t("renameFailedNotice", { ns: "chat" }));
    },
  });
  const deleteSessionMutation = useMutation({
    mutationFn: (sessionId: number) => deleteChatSession(sessionId),
    onSuccess: async (_, sessionId) => {
      await queryClient.invalidateQueries({ queryKey: queryKeys.chat.sessions });
      if (activeSessionId === sessionId) {
        const nextSession = sessions.find((session) => session.id !== sessionId) ?? null;
        void navigate(
          nextSession
            ? { to: "/chat/$sessionId", params: { sessionId: String(nextSession.id) } }
            : { to: "/chat" },
        );
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
    } catch {
      // Rename failed, error handled by mutation
    }
  };

  const handleDeleteSession = useCallback(
    (sessionId: number) => {
      void deleteSessionMutation.mutateAsync(sessionId);
    },
    [deleteSessionMutation],
  );

  const handleRenameSubmit = useCallback(
    (sessionId: number) => (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      const titleInput = event.currentTarget.querySelector("input");
      const title = titleInput?.value ?? "";
      void submitRename(sessionId, title);
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

  const handleClearSearch = useCallback(() => setSearchValue(""), []);
  const showWorkspaceHeader = showWorkspaceBrand || showWorkspaceModeSwitcher;

  const SESSION_ROW_HEIGHT = 52;
  const menuPortalRef = useRef<HTMLDivElement>(null);
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
            ? "h-full w-full bg-transparent px-4 py-4"
            : "surface-panel-subtle h-full w-full rounded-2xl px-4 py-4",
          className,
        )}
        collapsible="none"
        role="complementary"
      >
        <SidebarHeader className={cn("p-0", showWorkspaceHeader ? "gap-5" : "gap-3")}>
          {showWorkspaceBrand ? (
            <BrandMark
              alt={t("workspaceLogoAlt", { ns: "common" })}
              className="px-1"
              subtitle={t("workspaceSubtitle", { ns: "common" })}
              title={t("workspaceTitle", { ns: "common" })}
            />
          ) : null}

          {showWorkspaceModeSwitcher ? (
            <WorkspaceModeSwitcher onNavigate={onNavigate} pathname={pathname} />
          ) : null}

          <div className={cn("space-y-1.5", showWorkspaceHeader ? "px-0.5" : "px-0")}>
            <label className="relative block">
              <SearchIcon className="pointer-events-none absolute top-1/2 left-2.5 size-3.25 -translate-y-1/2 text-muted-foreground/48" />
              <SidebarInput
                aria-label={t("searchSessionsLabel", { ns: "chat" })}
                className="h-8 rounded-xl border-border/45 bg-background/44 pr-3 pl-8 text-[12px] placeholder:text-muted-foreground/42"
                onChange={(event) => setSearchValue(event.target.value)}
                placeholder={t("searchSessionsLabel", { ns: "chat" })}
                value={searchValue}
              />
            </label>

            <Button
              aria-label={t("newSessionAction", { ns: "chat" })}
              className="h-9 w-full justify-start rounded-xl border border-transparent bg-background/20 px-2.5 text-[12px] font-medium text-foreground shadow-none hover:bg-background/36"
              disabled={createSessionPending}
              onClick={onCreateSession}
              size="sm"
              type="button"
              variant="ghost"
            >
              <span className="flex size-4 shrink-0 items-center justify-center rounded-md border border-border/52 bg-background/72">
                <PlusIcon aria-hidden="true" className="size-3" />
              </span>
              <span>{t("newSessionAction", { ns: "chat" })}</span>
            </Button>
          </div>
        </SidebarHeader>

        <SidebarContent className="min-h-0 gap-0 overflow-hidden px-0 pt-3">
          <SidebarSeparator className="mx-0 mb-2 opacity-45" />
          <div className="min-h-0 flex-1">
            {filteredSessions.length === 0 ? (
              <Empty className="rounded-2xl bg-background/24 px-3.5 py-6">
                <EmptyHeader>
                  <EmptyTitle className="text-sm">
                    {searchValue
                      ? t("sessionSearchEmptyTitle", { ns: "chat" })
                      : t("sessionListEmptyTitle", { ns: "chat" })}
                  </EmptyTitle>
                  <EmptyDescription className="text-xs leading-relaxed text-muted-foreground/64">
                    {searchValue
                      ? t("sessionSearchEmptyDescription", { ns: "chat" })
                      : t("sessionListEmptyDescription", { ns: "chat" })}
                  </EmptyDescription>
                </EmptyHeader>
                {searchValue ? (
                  <Button
                    className="mt-2.5 h-7 text-xs"
                    onClick={handleClearSearch}
                    size="sm"
                    type="button"
                    variant="outline"
                  >
                    {t("clearSearchAction", { ns: "chat" })}
                  </Button>
                ) : null}
              </Empty>
            ) : (
              <div
                ref={parentRef}
                className="h-full min-h-0 overflow-auto pr-1.5"
                data-testid="chat-sidebar-session-list"
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
                            menuPortalContainer={menuPortalRef}
                            onBeginRename={beginRename}
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

        {showAccountMenu ? (
          <SidebarFooter className="mt-auto gap-3 p-0 pt-3">
            <SidebarSeparator className="mx-0 mb-1 opacity-56" />
            <WorkspaceAccountMenu
              className={accountMenuCompact ? "mx-auto" : undefined}
              compact={accountMenuCompact}
              contentPortalContainer={menuPortalRef}
              contentPortalled={accountMenuPortalled}
              onLogout={onLogout}
              onNavigate={onNavigate}
              user={user}
            />
          </SidebarFooter>
        ) : null}
        <div data-slot="chat-sidebar-menu-portal" ref={menuPortalRef} />
      </Sidebar>
    </SidebarProvider>
  );
}
