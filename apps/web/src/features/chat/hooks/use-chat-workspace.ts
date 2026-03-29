/**
 * @file 聊天相关 Hook 模块。
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
  type InfiniteData,
} from "@tanstack/react-query";
import type { FileRejection } from "react-dropzone";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";

import {
  chatMessagesWindowInfiniteQueryOptions,
  chatSessionsQueryOptions,
} from "@/features/chat/api/chat-query";
import { uploadDocument } from "@/features/knowledge/api/documents";
import { detectSupportedUploadKind } from "@/features/knowledge/upload-file-types";
import { queryKeys } from "@/lib/api/query-keys";
import { getDocumentUploadRejectionMessage, runDocumentUpload } from "@/lib/document-upload";
import { deleteChatMessage, type ChatMessageItem } from "../api/chat";
import { startChatStream, type ChatStreamAttachmentInput } from "../api/chat-stream";
import { useChatSessionSubmitController } from "../hooks/use-chat-session-submit-controller";
import { useChatStreamStore } from "../store/chat-stream-store";
import { useChatUiStore } from "../store/chat-ui-store";
import { buildDisplayMessages } from "../utils/build-display-messages";
import {
  buildLocalAttachmentFingerprint,
  cloneChatAttachments,
  collectLocalAttachmentFingerprints,
  resolveSubmitErrorMessage,
  serializeChatAttachments,
  shouldResetComposerSnapshotForRetry,
} from "../utils/chat-submit-helpers";
import { patchPagedChatMessagesCache } from "../utils/patch-paged-chat-messages";
import { resolveSessionTitle } from "../utils/session-title";
import { uploadQueuedChatAttachments } from "../utils/upload-chat-attachments";

/**
 * 封装聊天工作区的数据与交互。
 */
export function useChatWorkspace(activeSessionId: number | null) {
  const { t } = useTranslation(["chat", "common"]);
  const queryClient = useQueryClient();
  const currentSessionIdRef = useRef(activeSessionId);
  const [scrollToLatestRequestKey, setScrollToLatestRequestKey] = useState(0);
  const attachmentsBySession = useChatUiStore((state) => state.attachmentsBySession);
  const addAttachment = useChatUiStore((state) => state.addAttachment);
  const clearAttachments = useChatUiStore((state) => state.clearAttachments);
  const draftsBySession = useChatUiStore((state) => state.draftsBySession);
  const removeAttachment = useChatUiStore((state) => state.removeAttachment);
  const sendShortcut = useChatUiStore((state) => state.sendShortcut);
  const setAttachments = useChatUiStore((state) => state.setAttachments);
  const setSendShortcut = useChatUiStore((state) => state.setSendShortcut);
  const setDraft = useChatUiStore((state) => state.setDraft);

  const runsById = useChatStreamStore((state) => state.runsById);
  const startRun = useChatStreamStore((state) => state.startRun);
  const appendDelta = useChatStreamStore((state) => state.appendDelta);
  const addSource = useChatStreamStore((state) => state.addSource);
  const completeRun = useChatStreamStore((state) => state.completeRun);
  const failRun = useChatStreamStore((state) => state.failRun);
  const markToastShown = useChatStreamStore((state) => state.markToastShown);
  const pruneRuns = useChatStreamStore((state) => state.pruneRuns);
  const removeRun = useChatStreamStore((state) => state.removeRun);
  const { beginSessionSubmit, finishSessionSubmit, isSessionSubmitPending } =
    useChatSessionSubmitController();

  const sessionsQuery = useQuery(chatSessionsQueryOptions());
  const sessions = Array.isArray(sessionsQuery.data) ? sessionsQuery.data : [];
  const resolvedActiveSessionId = useMemo(() => {
    if (activeSessionId === null || sessionsQuery.isPending) {
      return null;
    }

    return sessions.some((session) => session.id === activeSessionId) ? activeSessionId : null;
  }, [activeSessionId, sessions, sessionsQuery.isPending]);
  const messagesWindowQuery = useInfiniteQuery(
    chatMessagesWindowInfiniteQueryOptions(resolvedActiveSessionId),
  );

  useEffect(() => {
    currentSessionIdRef.current = resolvedActiveSessionId;
  }, [resolvedActiveSessionId]);

  const patchSessionContext = useCallback(
    ({
      latestAssistantMessageId,
      latestAssistantSources,
      sessionId,
    }: {
      latestAssistantMessageId: number;
      latestAssistantSources: Array<Record<string, unknown>>;
      sessionId: number;
    }) => {
      let patched = false;

      queryClient.setQueryData(queryKeys.chat.context(sessionId), (current) => {
        if (!current || typeof current !== "object") {
          return current;
        }

        patched = true;
        return {
          ...current,
          latest_assistant_message_id: latestAssistantMessageId,
          latest_assistant_sources: latestAssistantSources,
        };
      });

      if (!patched) {
        void queryClient.invalidateQueries({ queryKey: queryKeys.chat.context(sessionId) });
      }
    },
    [queryClient],
  );

  const sendMutation = useMutation({
    mutationFn: async ({
      attachments,
      sessionId,
      content,
      retryOfMessageId,
    }: {
      attachments?: ChatStreamAttachmentInput[];
      sessionId: number;
      content: string;
      retryOfMessageId?: number;
    }) => {
      let activeRunId: number | null = null;
      let receivedTerminalRunEvent = false;

      try {
        return await startChatStream({
          sessionId,
          body: {
            attachments,
            content,
            client_request_id: crypto.randomUUID(),
            retry_of_message_id: retryOfMessageId,
          },
          onEvent: (event) => {
            const runId = Number(event.data.run_id ?? 0);
            if (event.event === "run.started") {
              activeRunId = runId;
              const userMessageId =
                typeof event.data.user_message_id === "number" ? event.data.user_message_id : null;
              startRun({
                runId,
                sessionId: Number(event.data.session_id ?? sessionId),
                assistantMessageId: Number(event.data.assistant_message_id ?? 0),
                retryOfMessageId: retryOfMessageId ?? null,
                userMessageId,
                userContent: content,
              });
              if (userMessageId !== null) {
                queryClient.setQueryData<InfiniteData<ChatMessageItem[], number | null>>(
                  queryKeys.chat.messagesWindow(sessionId),
                  (current) => {
                    if (!current || typeof current !== "object" || !("pages" in current)) {
                      return current;
                    }

                    const knownIds = new Set(
                      current.pages.flatMap((page: ChatMessageItem[]) =>
                        page.map((message) => message.id),
                      ),
                    );
                    if (knownIds.has(userMessageId)) {
                      return current;
                    }

                    const nextLastPage = [
                      ...(current.pages.at(-1) ?? []),
                      {
                        content,
                        id: userMessageId,
                        role: "user",
                        status: "succeeded",
                        sources_json: [],
                      } satisfies ChatMessageItem,
                    ];

                    return {
                      ...current,
                      pages: [...current.pages.slice(0, -1), nextLastPage],
                    };
                  },
                );
              }
              return;
            }

            if (event.event === "part.text.delta" || event.event === "message.delta") {
              appendDelta(runId, typeof event.data.delta === "string" ? event.data.delta : "");
              return;
            }

            if (event.event === "part.source" && event.data.source) {
              addSource(runId, event.data.source as Record<string, unknown>);
              return;
            }

            if (event.event === "sources.final" && Array.isArray(event.data.sources)) {
              for (const source of event.data.sources) {
                addSource(runId, source as Record<string, unknown>);
              }
              return;
            }

            if (event.event === "run.completed") {
              receivedTerminalRunEvent = true;
              completeRun(runId);
              const currentRun = useChatStreamStore.getState().runsById[runId];
              const patched =
                currentRun != null
                  ? patchPagedChatMessagesCache({
                      appendIfMissing: currentRun.userMessageId
                        ? [
                            {
                              content: currentRun.userContent,
                              id: currentRun.userMessageId,
                              role: "user",
                              status: "succeeded",
                              sources_json: [],
                            },
                            {
                              content: currentRun.content,
                              id: currentRun.assistantMessageId,
                              reply_to_message_id:
                                currentRun.retryOfMessageId ?? currentRun.userMessageId,
                              role: "assistant",
                              status: "succeeded",
                              sources_json: currentRun.sources as ChatMessageItem["sources_json"],
                            },
                          ]
                        : [
                            {
                              content: currentRun.content,
                              id: currentRun.assistantMessageId,
                              reply_to_message_id: currentRun.retryOfMessageId ?? null,
                              role: "assistant",
                              status: "succeeded",
                              sources_json: currentRun.sources as ChatMessageItem["sources_json"],
                            },
                          ],
                      assistantMessageId: currentRun.assistantMessageId,
                      patch: {
                        content: currentRun.content,
                        error_message: null,
                        sources_json: currentRun.sources as ChatMessageItem["sources_json"],
                        status: "succeeded",
                      },
                      queryClient,
                      sessionId,
                    })
                  : false;

              if (currentRun != null) {
                patchSessionContext({
                  latestAssistantMessageId: currentRun.assistantMessageId,
                  latestAssistantSources: currentRun.sources,
                  sessionId,
                });
              }

              const refreshPromise = patched
                ? Promise.resolve()
                : queryClient.invalidateQueries({
                    queryKey: queryKeys.chat.messagesWindow(sessionId),
                  });
              void refreshPromise.then(() => {
                if (currentSessionIdRef.current === sessionId) {
                  pruneRuns([runId]);
                }
              });
              return;
            }

            if (event.event === "run.failed") {
              receivedTerminalRunEvent = true;
              const errorMessage =
                typeof event.data.error_message === "string"
                  ? event.data.error_message
                  : t("assistantStreamingInterruptedError");
              failRun(runId, errorMessage);
              const currentRun = useChatStreamStore.getState().runsById[runId];
              const patched =
                currentRun != null
                  ? patchPagedChatMessagesCache({
                      appendIfMissing: currentRun.userMessageId
                        ? [
                            {
                              content: currentRun.userContent,
                              error_message: errorMessage,
                              id: currentRun.userMessageId,
                              role: "user",
                              status: "failed",
                              sources_json: [],
                            },
                            {
                              content: currentRun.content,
                              error_message: errorMessage,
                              id: currentRun.assistantMessageId,
                              reply_to_message_id:
                                currentRun.retryOfMessageId ?? currentRun.userMessageId,
                              role: "assistant",
                              status: "failed",
                              sources_json: currentRun.sources as ChatMessageItem["sources_json"],
                            },
                          ]
                        : [
                            {
                              content: currentRun.content,
                              error_message: errorMessage,
                              id: currentRun.assistantMessageId,
                              reply_to_message_id: currentRun.retryOfMessageId ?? null,
                              role: "assistant",
                              status: "failed",
                              sources_json: currentRun.sources as ChatMessageItem["sources_json"],
                            },
                          ],
                      assistantMessageId: currentRun.assistantMessageId,
                      patch: {
                        content: currentRun.content,
                        error_message: errorMessage,
                        sources_json: currentRun.sources as ChatMessageItem["sources_json"],
                        status: "failed",
                      },
                      queryClient,
                      sessionId,
                    })
                  : false;

              if (currentRun != null) {
                patchSessionContext({
                  latestAssistantMessageId: currentRun.assistantMessageId,
                  latestAssistantSources: currentRun.sources,
                  sessionId,
                });
              }

              const refreshPromise = patched
                ? Promise.resolve()
                : queryClient.invalidateQueries({
                    queryKey: queryKeys.chat.messagesWindow(sessionId),
                  });
              void refreshPromise.then(() => {
                pruneRuns([runId]);
              });
            }
          },
        });
      } catch (error) {
        if (activeRunId !== null && !receivedTerminalRunEvent) {
          failRun(activeRunId, t("assistantStreamingInterruptedError"));
        } else {
          toast.error(resolveSubmitErrorMessage(error, t("messageSendFailedToast")));
        }

        throw error;
      }
    },
  });

  const messages = useMemo(
    () => messagesWindowQuery.data?.pages.flatMap((page) => page) ?? [],
    [messagesWindowQuery.data],
  );
  const attachments =
    resolvedActiveSessionId === null
      ? []
      : (attachmentsBySession[String(resolvedActiveSessionId)] ?? []);
  const draft =
    resolvedActiveSessionId === null
      ? ""
      : (draftsBySession[String(resolvedActiveSessionId)] ?? "");
  const activeSession = useMemo(
    () => sessions.find((session) => session.id === resolvedActiveSessionId) ?? null,
    [resolvedActiveSessionId, sessions],
  );
  const displayMessages = useMemo(
    () =>
      buildDisplayMessages({
        activeSessionId: resolvedActiveSessionId,
        messages,
        runsById,
      }),
    [resolvedActiveSessionId, messages, runsById],
  );
  const submitPending = isSessionSubmitPending(resolvedActiveSessionId);

  useEffect(() => {
    if (sessionsQuery.isPending || sessions.length === 0) {
      return;
    }

    Object.values(runsById).forEach((run) => {
      if (
        run.status !== "succeeded" ||
        run.toastShown ||
        run.sessionId === resolvedActiveSessionId
      ) {
        return;
      }

      const session = sessions.find((item) => item.id === run.sessionId);
      const title = resolveSessionTitle(session?.title, t("sessionTitleFallback"));
      toast.success(t("backgroundSessionCompletedToast", { title }));
      markToastShown(run.runId);
      removeRun(run.runId);
    });
  }, [
    markToastShown,
    removeRun,
    resolvedActiveSessionId,
    runsById,
    sessions,
    sessionsQuery.isPending,
    t,
  ]);

  const submitMessage = async () => {
    if (resolvedActiveSessionId === null) {
      return;
    }

    const sessionId = resolvedActiveSessionId;
    if (!beginSessionSubmit(sessionId)) {
      return;
    }

    const nextDraft = useChatUiStore.getState().draftsBySession[String(sessionId)] ?? "";
    const snapshotAttachments = cloneChatAttachments(
      useChatUiStore.getState().attachmentsBySession[String(sessionId)] ?? [],
    );
    const sendableAttachments = snapshotAttachments.filter(
      (attachment) => attachment.status !== "failed",
    );

    if (!nextDraft.trim() && sendableAttachments.length === 0) {
      finishSessionSubmit(sessionId);
      return;
    }

    setDraft(sessionId, "");
    clearAttachments(sessionId);

    const workingAttachments = cloneChatAttachments(snapshotAttachments);

    try {
      const { uploadedAttachments: persistedAttachments, uploadedCount } =
        await uploadQueuedChatAttachments({
          attachments: workingAttachments.filter((item) => item.status !== "failed"),
          concurrency: 2,
          failedMessage: t("attachmentUploadFailed"),
          onPatch: (attachmentId, patch) => {
            const targetAttachment = workingAttachments.find((item) => item.id === attachmentId);
            if (!targetAttachment) {
              return;
            }
            Object.assign(targetAttachment, patch);
          },
          uploadFile: async (attachment) => {
            const document = await runDocumentUpload({
              failedMessage: t("attachmentUploadFailed"),
              file: attachment.file as File,
              onPatch: () => {},
              upload: uploadDocument,
            });
            return document;
          },
        });

      if (uploadedCount > 0) {
        void queryClient.invalidateQueries({ queryKey: queryKeys.documents.list });
      }

      const serializedAttachments = serializeChatAttachments(persistedAttachments);
      if (!nextDraft.trim() && serializedAttachments.length === 0) {
        return;
      }

      setScrollToLatestRequestKey((current) => current + 1);
      const streamResult = await sendMutation.mutateAsync({
        attachments: serializedAttachments,
        sessionId,
        content: nextDraft,
      });
      if (streamResult.userMessageId && serializedAttachments.length > 0) {
        await queryClient.invalidateQueries({ queryKey: queryKeys.chat.messagesWindow(sessionId) });
        void queryClient.invalidateQueries({ queryKey: queryKeys.documents.list });
      }
    } catch {
      setDraft(sessionId, nextDraft);
      setAttachments(sessionId, workingAttachments);
      return;
    } finally {
      finishSessionSubmit(sessionId);
    }
  };

  const attachFiles = useCallback(
    (files: File[]) => {
      if (resolvedActiveSessionId === null || files.length === 0) {
        return;
      }

      const existingAttachments =
        useChatUiStore.getState().attachmentsBySession[String(resolvedActiveSessionId)] ?? [];
      const knownFingerprints = collectLocalAttachmentFingerprints(existingAttachments);

      for (const file of files) {
        const fingerprint = buildLocalAttachmentFingerprint(file);
        if (knownFingerprints.has(fingerprint)) {
          continue;
        }
        knownFingerprints.add(fingerprint);

        const attachmentId = crypto.randomUUID();
        const kind = detectSupportedUploadKind(file);
        if (kind === null) {
          addAttachment(resolvedActiveSessionId, {
            id: attachmentId,
            kind: "document",
            name: file.name,
            sizeBytes: file.size,
            status: "failed",
            errorMessage: t("attachmentUnsupportedFileType"),
          });
          toast.error(t("attachmentUnsupportedFileType"));
          continue;
        }

        addAttachment(resolvedActiveSessionId, {
          id: attachmentId,
          kind,
          name: file.name,
          sizeBytes: file.size,
          file,
          mimeType: file.type || undefined,
          status: "queued",
        });
      }
    },
    [addAttachment, resolvedActiveSessionId, t],
  );

  const rejectFiles = useCallback(
    (rejections: FileRejection[]) => {
      if (resolvedActiveSessionId === null || rejections.length === 0) {
        return;
      }

      rejections.forEach((rejection) => {
        const message = getDocumentUploadRejectionMessage(rejection, {
          failedMessage: t("attachmentUploadFailed"),
          unsupportedFileTypeMessage: t("attachmentUnsupportedFileType"),
        });
        addAttachment(resolvedActiveSessionId, {
          id: crypto.randomUUID(),
          errorMessage: message,
          kind: "document",
          name: rejection.file.name,
          sizeBytes: rejection.file.size,
          status: "failed",
        });
        toast.error(message);
      });
    },
    [addAttachment, resolvedActiveSessionId, t],
  );

  const retryMessage = useCallback(
    async (message: ChatMessageItem) => {
      if (resolvedActiveSessionId === null) {
        return;
      }

      const sessionId = resolvedActiveSessionId;
      if (!beginSessionSubmit(sessionId)) {
        return;
      }

      const retryOfMessageId =
        message.role === "assistant" ? (message.reply_to_message_id ?? null) : message.id;
      if (retryOfMessageId === null) {
        finishSessionSubmit(sessionId);
        return;
      }

      const retryContent =
        message.role === "assistant"
          ? (messages.find((item) => item.id === retryOfMessageId)?.content ??
            Object.values(runsById).find((run) => run.assistantMessageId === message.id)
              ?.userContent ??
            message.content)
          : message.content;
      const retryAttachments =
        message.role === "assistant"
          ? (messages.find((item) => item.id === retryOfMessageId)?.attachments_json ?? null)
          : (message.attachments_json ?? null);
      const draftSnapshot = useChatUiStore.getState().draftsBySession[String(sessionId)] ?? "";
      const attachmentSnapshot = cloneChatAttachments(
        useChatUiStore.getState().attachmentsBySession[String(sessionId)] ?? [],
      );
      const shouldResetComposerSnapshot = shouldResetComposerSnapshotForRetry({
        composerAttachments: attachmentSnapshot,
        composerDraft: draftSnapshot,
        retryAttachments,
        retryContent,
      });

      if (shouldResetComposerSnapshot) {
        setDraft(sessionId, "");
        clearAttachments(sessionId);
      }

      try {
        setScrollToLatestRequestKey((current) => current + 1);
        await sendMutation.mutateAsync({
          sessionId,
          content: retryContent,
          retryOfMessageId,
        });
      } catch {
        if (shouldResetComposerSnapshot) {
          setDraft(sessionId, draftSnapshot);
          setAttachments(sessionId, attachmentSnapshot);
        }
        return;
      } finally {
        finishSessionSubmit(sessionId);
      }
    },
    [
      beginSessionSubmit,
      clearAttachments,
      finishSessionSubmit,
      messages,
      resolvedActiveSessionId,
      runsById,
      sendMutation,
      setAttachments,
      setDraft,
    ],
  );

  const editFailedMessage = useCallback(
    (message: ChatMessageItem) => {
      if (resolvedActiveSessionId === null) {
        return;
      }
      setDraft(resolvedActiveSessionId, message.content);
    },
    [resolvedActiveSessionId, setDraft],
  );

  const deleteFailedMessage = useCallback(
    async (message: ChatMessageItem) => {
      await deleteChatMessage(message.id);
      if (resolvedActiveSessionId !== null) {
        await queryClient.invalidateQueries({
          queryKey: queryKeys.chat.messagesWindow(resolvedActiveSessionId),
        });
      }
    },
    [queryClient, resolvedActiveSessionId],
  );

  const hasOlderMessages = messagesWindowQuery.hasNextPage ?? false;
  const isLoadingOlderMessages = messagesWindowQuery.isFetchingNextPage;

  const loadOlderMessages = useCallback(async () => {
    if (!hasOlderMessages || isLoadingOlderMessages) {
      return;
    }

    await messagesWindowQuery.fetchNextPage();
  }, [hasOlderMessages, isLoadingOlderMessages, messagesWindowQuery]);

  return {
    activeSession,
    activeSessionId: resolvedActiveSessionId,
    attachments,
    deleteFailedMessage,
    displayMessages,
    draft,
    editFailedMessage,
    hasMessages: displayMessages.length > 0,
    hasOlderMessages,
    removeAttachment,
    retryMessage,
    scrollToLatestRequestKey,
    sendShortcut,
    setSendShortcut,
    sessions,
    sessionsReady: !sessionsQuery.isPending && !messagesWindowQuery.isPending,
    setDraft,
    submitMessage,
    submitPending,
    isLoadingOlderMessages,
    loadOlderMessages,
    attachFiles,
    rejectFiles,
  };
}
