/**
 * @file 聊天页面模块。
 */

import { useCallback, useEffect, useLayoutEffect } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { TFunction } from "i18next";
import { useTranslation } from "react-i18next";
import { FilePlus2Icon, MessageSquareDashedIcon } from "lucide-react";
import { useNavigate, useParams } from "react-router-dom";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { updateChatSession, type ChatReasoningMode } from "@/features/chat/api/chat";
import { chatProfileQueryOptions } from "@/features/chat/api/chat-query";
import type { ChatProfileItem } from "@/features/chat/api/chat";
import {
  clearLastVisitedChatSessionId,
  readLastVisitedChatSessionId,
  resolveRestorableChatSessionId,
  writeLastVisitedChatSessionId,
} from "@/features/chat/utils/chat-session-recovery";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
} from "@/components/ui/empty";
import { ChatMessageViewport } from "@/features/chat/components/chat-message-viewport";
import { MessageInput } from "@/features/chat/components/message-input";
import { useChatWorkspace } from "@/features/chat/hooks/use-chat-workspace";
import type { ChatMessageItem } from "@/features/chat/api/chat";
import { buildChatSessionPath, parseChatSessionId } from "@/features/chat/utils/chat-session-route";
import { resolveSessionTitle } from "@/features/chat/utils/session-title";
import { getProviderLabel } from "@/lib/provider-display";
import { queryKeys } from "@/lib/api/query-keys";

function formatActiveModelLabel(profile: ChatProfileItem | undefined, tSettings: TFunction) {
  if (!profile || !profile.configured) {
    return null;
  }

  const providerLabel = getProviderLabel(profile.provider, tSettings);
  if (!profile.model) {
    return providerLabel;
  }

  return `${providerLabel} / ${profile.model}`;
}

/**
 * 渲染聊天页面。
 */
export function ChatPage() {
  const { t } = useTranslation(["chat", "common"]);
  const { t: tSettings } = useTranslation("settings");
  const navigate = useNavigate();
  const { sessionId: sessionIdParam } = useParams<{ sessionId?: string }>();
  const queryClient = useQueryClient();
  const routeSessionId = parseChatSessionId(sessionIdParam);
  const chatProfileQuery = useQuery(chatProfileQueryOptions());
  const updateSessionMutation = useMutation({
    mutationFn: ({
      reasoningMode,
      sessionId,
    }: {
      reasoningMode: ChatReasoningMode;
      sessionId: number;
    }) => updateChatSession(sessionId, { reasoning_mode: reasoningMode }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: queryKeys.chat.sessions });
    },
  });
  const {
    activeSession,
    attachments,
    attachFiles,
    deleteFailedMessage,
    displayMessages,
    draft,
    editFailedMessage,
    hasMessages,
    removeAttachment,
    rejectFiles,
    retryMessage,
    scrollToLatestRequestKey,
    sendShortcut,
    activeSessionId,
    sessions,
    sessionsReady,
    setDraft,
    submitMessage,
    submitPending,
  } = useChatWorkspace(routeSessionId);
  const isSessionsReady = sessionsReady !== false;
  const activeProfileConfigured = chatProfileQuery.data?.configured ?? true;
  const activeModelLabel = formatActiveModelLabel(chatProfileQuery.data, tSettings);
  const activeModelActionLabel = activeProfileConfigured ? null : t("configureOllamaAction");
  const attachmentScopeHint = attachments.length > 0 ? t("attachmentCurrentTurnScopeHint") : null;
  const sessionTitleFallback = t("sessionTitleFallback");

  const handleDeleteFailed = useCallback(
    (message: ChatMessageItem) => {
      void deleteFailedMessage(message);
    },
    [deleteFailedMessage],
  );

  useLayoutEffect(() => {
    if (sessionIdParam) {
      return;
    }

    if (!isSessionsReady) {
      return;
    }

    const preferredSessionId = readLastVisitedChatSessionId();
    const nextSessionId = resolveRestorableChatSessionId(sessions, preferredSessionId);
    if (nextSessionId === null) {
      clearLastVisitedChatSessionId();
      return;
    }

    if (preferredSessionId !== nextSessionId) {
      writeLastVisitedChatSessionId(nextSessionId);
    }

    void navigate(buildChatSessionPath(nextSessionId), { replace: true });
  }, [isSessionsReady, navigate, sessionIdParam, sessions]);

  useEffect(() => {
    if (!sessionIdParam) {
      return;
    }

    if (routeSessionId === null) {
      void navigate("/chat", { replace: true });
      return;
    }

    if (!isSessionsReady) {
      return;
    }

    if (activeSessionId !== null) {
      writeLastVisitedChatSessionId(activeSessionId);
      return;
    }

    const redirectTimer = window.setTimeout(() => {
      if (readLastVisitedChatSessionId() === routeSessionId) {
        clearLastVisitedChatSessionId();
      }
      void navigate("/chat", { replace: true });
    }, 0);

    return () => window.clearTimeout(redirectTimer);
  }, [activeSessionId, isSessionsReady, navigate, routeSessionId, sessionIdParam]);

  const shouldShowResolvingState =
    (!sessionIdParam && !isSessionsReady) ||
    (Boolean(sessionIdParam) &&
      (routeSessionId === null || !isSessionsReady || activeSessionId === null));
  const shouldShowPendingEmptyState = submitPending && !hasMessages;

  if (shouldShowResolvingState) {
    return (
      <div className="flex h-full min-h-[50vh] items-center justify-center px-6">
        <div className="flex items-center gap-3 rounded-full border border-border/70 bg-background/78 px-4 py-2 text-sm text-muted-foreground">
          <Spinner aria-hidden="true" className="size-4" />
          <span>{t("pageTitle")}</span>
        </div>
      </div>
    );
  }

  if (activeSessionId === null) {
    return (
      <div className="flex h-full min-h-[50vh] items-center justify-center px-6">
        <Empty className="max-w-xl rounded-[1.75rem] border border-dashed border-border/70 bg-background/72 p-10 shadow-[inset_0_1px_0_hsl(var(--background)/0.72)]">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <MessageSquareDashedIcon />
            </EmptyMedia>
            <h1 className="text-ui-display">{t("emptyConversationTitle")}</h1>
            <EmptyDescription className="text-ui-body measure-readable max-w-lg">
              {t("emptyConversationDescription")}
            </EmptyDescription>
          </EmptyHeader>
          <EmptyContent>
            <Button onClick={() => navigate("/knowledge")} type="button" variant="outline">
              <FilePlus2Icon data-icon="inline-start" />
              {t("emptySessionResourceAction")}
            </Button>
          </EmptyContent>
        </Empty>
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden bg-[radial-gradient(circle_at_top,hsl(var(--primary)/0.08),transparent_28%),radial-gradient(circle_at_100%_0%,hsl(var(--chart-2)/0.08),transparent_22%)]">
      <header className="shrink-0 px-5 pt-5 pb-3 sm:px-6">
        <div className="page-content-rail mx-auto px-2 py-1 sm:px-3">
          <div className="flex flex-wrap items-center gap-2.5">
            <p className="text-ui-kicker text-muted-foreground">{t("pageTitle")}</p>
            <Badge className="text-ui-caption rounded-full px-2.5 py-1" variant="outline">
              {hasMessages ? t("assistantRole") : t("emptySessionStepsTitle")}
            </Badge>
          </div>
          <div className="mt-2.5 space-y-2">
            <h1 className="text-ui-heading break-words">
              {resolveSessionTitle(activeSession?.title, sessionTitleFallback)}
            </h1>
          </div>
        </div>
      </header>

      <div className="min-h-0 flex-1 px-5 pb-4 sm:px-6">
        {hasMessages ? (
          <ChatMessageViewport
            key={activeSessionId ?? "empty"}
            messages={displayMessages}
            onDeleteFailed={handleDeleteFailed}
            onEditFailed={editFailedMessage}
            onRetry={retryMessage}
            scrollToLatestRequestKey={scrollToLatestRequestKey}
          />
        ) : shouldShowPendingEmptyState ? (
          <div className="flex h-full items-center">
            <div className="page-content-rail workspace-surface mx-auto rounded-[1.75rem] p-5 sm:p-6">
              <section className="space-y-4 py-3">
                <div className="flex items-center gap-3">
                  <Spinner aria-hidden="true" className="size-4" />
                  <p className="text-ui-kicker text-muted-foreground">{t("sendingAction")}</p>
                </div>
                <div className="space-y-2">
                  <h2 className="text-ui-display">{t("assistantStreamingStatus")}</h2>
                  <p className="text-ui-body measure-readable text-muted-foreground">
                    {t("assistantStreamingFallback")}
                  </p>
                </div>
              </section>
            </div>
          </div>
        ) : (
          <div className="flex h-full items-center">
            <div className="page-content-rail workspace-surface mx-auto rounded-[1.75rem] p-5 sm:p-6">
              <section className="space-y-6 py-3">
                <div className="space-y-3">
                  <p className="text-ui-kicker text-muted-foreground">{t("messageInputLabel")}</p>
                  <h2 className="text-ui-display">{t("emptySessionTitle")}</h2>
                  <p className="text-ui-body measure-readable text-muted-foreground">
                    {t("emptySessionDescription")}
                  </p>
                </div>

                <div className="flex flex-wrap items-center gap-3">
                  <Button onClick={() => navigate("/knowledge")} type="button" variant="outline">
                    <FilePlus2Icon data-icon="inline-start" />
                    {t("emptySessionResourceAction")}
                  </Button>
                  <p className="text-ui-subtle text-muted-foreground">
                    {sendShortcut === "enter"
                      ? t("messageShortcutHintEnter")
                      : t("messageShortcutHintShiftEnter")}
                  </p>
                </div>
              </section>
            </div>
          </div>
        )}
      </div>

      <div className="shrink-0 px-5 pb-5 sm:px-6">
        <div className="page-content-rail mx-auto" data-composer-embed="direct">
          <MessageInput
            activeModelActionLabel={activeModelActionLabel}
            activeModelLabel={activeModelLabel}
            attachmentScopeHint={attachmentScopeHint}
            attachments={attachments}
            draft={draft}
            onActiveModelAction={() => navigate("/settings?section=providers")}
            onAttachFiles={attachFiles}
            onChange={(value) => setDraft(activeSessionId, value)}
            onRejectFiles={rejectFiles}
            onRemoveAttachment={(attachmentId) => removeAttachment(activeSessionId, attachmentId)}
            onReasoningModeChange={(mode) => {
              updateSessionMutation.mutate({ reasoningMode: mode, sessionId: activeSessionId });
            }}
            onSubmit={() => {
              if (!activeProfileConfigured) {
                toast.error(t("providerSetupRequiredToast"));
                return;
              }
              void submitMessage();
            }}
            reasoningMode={activeSession?.reasoning_mode ?? "default"}
            reasoningModeVisible={activeSessionId !== null}
            sendShortcut={sendShortcut}
            submitPending={submitPending}
          />
        </div>
      </div>
    </div>
  );
}
