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
import { AssistantWaitingCard } from "@/features/chat/components/markdown-message";
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
    hasOlderMessages,
    isLoadingOlderMessages,
    loadOlderMessages,
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

  const handleNavigateToSettings = useCallback(() => {
    void navigate("/settings?section=providers");
  }, [navigate]);

  const handleNavigateToKnowledge = useCallback(() => {
    void navigate("/knowledge");
  }, [navigate]);

  const handleDraftChange = useCallback(
    (value: string) => {
      setDraft(activeSessionId, value);
    },
    [activeSessionId, setDraft],
  );

  const handleRemoveAttachment = useCallback(
    (attachmentId: string) => {
      removeAttachment(activeSessionId, attachmentId);
    },
    [activeSessionId, removeAttachment],
  );

  const handleReasoningModeChange = useCallback(
    (mode: ChatReasoningMode) => {
      if (activeSessionId == null) return;
      updateSessionMutation.mutate({ reasoningMode: mode, sessionId: activeSessionId });
    },
    [activeSessionId, updateSessionMutation],
  );

  const handleSubmit = useCallback(() => {
    if (!activeProfileConfigured) {
      toast.error(t("providerSetupRequiredToast"));
      return;
    }
    void submitMessage();
  }, [activeProfileConfigured, submitMessage, t]);

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
    (!sessionIdParam && isSessionsReady && sessions.length > 0 && activeSessionId === null) ||
    (Boolean(sessionIdParam) &&
      (routeSessionId === null || !isSessionsReady || activeSessionId === null));
  const shouldShowPendingEmptyState = submitPending && !hasMessages;

  if (shouldShowResolvingState) {
    return (
      <div className="flex h-full min-h-[50vh] items-center justify-center px-6">
        <div className="flex items-center gap-3 rounded-full border border-border/70 bg-background/78 px-4 py-2 text-ui-caption text-muted-foreground">
          <Spinner aria-hidden="true" className="size-4" />
          <span>{t("pageTitle")}</span>
        </div>
      </div>
    );
  }

  if (activeSessionId === null) {
    return (
      <div className="flex h-full min-h-[50vh] items-center justify-center px-6">
        <Empty className="max-w-xl rounded-3xl border border-dashed border-border/70 bg-background/72 p-10 sm:p-12 shadow-[inset_0_1px_0_hsl(var(--background)/0.72)]">
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
            <Button onClick={handleNavigateToKnowledge} type="button" variant="outline">
              <FilePlus2Icon data-icon="inline-start" />
              {t("emptySessionResourceAction")}
            </Button>
          </EmptyContent>
        </Empty>
      </div>
    );
  }

  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden bg-[radial-gradient(ellipse_72%_52%_at_top,hsl(var(--primary)/0.06),transparent_44%)]">
      {/* 优化 header 间距节奏 */}
      <header className="shrink-0 px-4 pt-4 pb-3 sm:px-6 sm:pt-5 sm:pb-3">
        <div className="page-content-rail mx-auto">
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-ui-kicker text-muted-foreground">{t("pageTitle")}</p>
            <Badge
              className="text-ui-caption rounded-full px-2.5 py-1 transition-colors"
              variant="outline"
            >
              {hasMessages ? t("assistantRole") : t("emptySessionStepsTitle")}
            </Badge>
          </div>
          <div className="mt-2 space-y-1">
            <h1 className="text-ui-heading break-words text-balance">
              {resolveSessionTitle(activeSession?.title, sessionTitleFallback)}
            </h1>
          </div>
        </div>
      </header>

      <div className="flex min-h-0 flex-1 flex-col px-4 pb-4 sm:px-6 sm:pb-5">
        {hasMessages ? (
          <ChatMessageViewport
            key={activeSessionId ?? "empty"}
            hasOlderMessages={hasOlderMessages}
            isLoadingOlderMessages={isLoadingOlderMessages}
            messages={displayMessages}
            onDeleteFailed={handleDeleteFailed}
            onEditFailed={editFailedMessage}
            onLoadOlderMessages={loadOlderMessages}
            onRetry={retryMessage}
            scrollToLatestRequestKey={scrollToLatestRequestKey}
          />
        ) : shouldShowPendingEmptyState ? (
          <div className="flex min-h-0 flex-1 items-center">
            <div className="page-content-rail workspace-surface mx-auto rounded-3xl p-5 sm:p-6">
              <section className="py-3">
                <AssistantWaitingCard
                  caption={t("sendingAction")}
                  detail={t("assistantStreamingFallback")}
                  statusLabel={t("assistantStreamingStatus")}
                  testId="assistant-waiting-card"
                />
              </section>
            </div>
          </div>
        ) : (
          <div className="flex min-h-0 flex-1 items-center">
            <div className="page-content-rail workspace-surface mx-auto rounded-3xl p-6 sm:p-8">
              <section className="space-y-7 py-4">
                <div className="space-y-3.5">
                  <p className="text-ui-kicker text-muted-foreground">{t("messageInputLabel")}</p>
                  <h2 className="text-ui-display">{t("emptySessionTitle")}</h2>
                  <p className="text-ui-body measure-readable text-muted-foreground">
                    {t("emptySessionDescription")}
                  </p>
                </div>

                <div className="flex flex-wrap items-center gap-3.5">
                  <Button onClick={handleNavigateToKnowledge} type="button" variant="outline">
                    <FilePlus2Icon data-icon="inline-start" />
                    {t("emptySessionResourceAction")}
                  </Button>
                  <p className="text-ui-subtle text-muted-foreground/82">
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

      {/* 优化底部输入区域间距 */}
      <div className="shrink-0 px-4 pb-4 sm:px-6 sm:pb-5">
        <div className="page-content-rail mx-auto" data-composer-embed="direct">
          <MessageInput
            activeModelActionLabel={activeModelActionLabel}
            activeModelLabel={activeModelLabel}
            attachmentScopeHint={attachmentScopeHint}
            attachments={attachments}
            draft={draft}
            onActiveModelAction={handleNavigateToSettings}
            onAttachFiles={attachFiles}
            onChange={handleDraftChange}
            onRejectFiles={rejectFiles}
            onRemoveAttachment={handleRemoveAttachment}
            onReasoningModeChange={handleReasoningModeChange}
            onSubmit={handleSubmit}
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
