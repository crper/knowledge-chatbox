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
import {
  deleteChatMessage,
  type ChatAttachmentItem as PersistedChatAttachmentItem,
  type ChatMessageItem,
  type ChatSessionContextItem,
} from "../api/chat";
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

function toPersistedChatAttachments(
  attachments: ChatStreamAttachmentInput[],
): PersistedChatAttachmentItem[] {
  return attachments.map((attachment) => ({
    attachment_id: attachment.attachment_id,
    archived_at: null,
    name: attachment.name,
    mime_type: attachment.mime_type,
    resource_document_id: attachment.document_id ?? null,
    resource_document_version_id: attachment.document_revision_id,
    size_bytes: attachment.size_bytes,
    type: attachment.type,
  }));
}

function buildContextAttachmentKey(attachment: PersistedChatAttachmentItem) {
  if (attachment.resource_document_id != null) {
    return `document:${attachment.resource_document_id}`;
  }

  if (attachment.resource_document_version_id != null) {
    return `version:${attachment.resource_document_version_id}`;
  }

  return `attachment:${attachment.attachment_id}`;
}

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
  type StreamRun = (typeof runsById)[number];
  type StreamRunTerminalStatus = "failed" | "succeeded";
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
      attachments,
      latestAssistantMessageId,
      latestAssistantSources,
      sessionId,
    }: {
      attachments?: ChatSessionContextItem["attachments"];
      latestAssistantMessageId?: number;
      latestAssistantSources?: ChatSessionContextItem["latest_assistant_sources"];
      sessionId: number;
    }) => {
      let patched = false;

      queryClient.setQueryData<ChatSessionContextItem | null>(
        queryKeys.chat.context(sessionId),
        (current) => {
          if (!current) {
            return current;
          }

          patched = true;
          const nextAttachments =
            attachments == null
              ? current.attachments
              : (() => {
                  const attachmentMap = new Map<string, PersistedChatAttachmentItem>();
                  for (const attachment of current.attachments ?? []) {
                    attachmentMap.set(buildContextAttachmentKey(attachment), attachment);
                  }
                  for (const attachment of attachments) {
                    attachmentMap.set(buildContextAttachmentKey(attachment), attachment);
                  }
                  return Array.from(attachmentMap.values());
                })();

          return {
            ...current,
            attachment_count: nextAttachments?.length ?? 0,
            attachments: nextAttachments,
            latest_assistant_message_id:
              latestAssistantMessageId ?? current.latest_assistant_message_id,
            latest_assistant_sources: latestAssistantSources ?? current.latest_assistant_sources,
          };
        },
      );

      if (!patched) {
        void queryClient.invalidateQueries({ queryKey: queryKeys.chat.context(sessionId) });
      }
    },
    [queryClient],
  );

  const patchUserMessageAttachments = useCallback(
    ({
      attachments,
      sessionId,
      userMessageId,
    }: {
      attachments: PersistedChatAttachmentItem[];
      sessionId: number;
      userMessageId: number;
    }) => {
      let patched = false;

      queryClient.setQueryData<InfiniteData<ChatMessageItem[], number | null>>(
        queryKeys.chat.messagesWindow(sessionId),
        (current) => {
          if (!current || typeof current !== "object" || !("pages" in current)) {
            return current;
          }

          const nextPages = current.pages.map((page) =>
            page.map((message) => {
              if (message.id !== userMessageId || message.role !== "user") {
                return message;
              }

              patched = true;
              return {
                ...message,
                attachments_json: attachments,
              };
            }),
          );

          return patched ? { ...current, pages: nextPages } : current;
        },
      );

      return patched;
    },
    [queryClient],
  );

  const buildTerminalMessages = useCallback(
    ({
      errorMessage,
      run,
      status,
    }: {
      errorMessage: string | null;
      run: StreamRun;
      status: StreamRunTerminalStatus;
    }): ChatMessageItem[] => {
      const assistantMessage: ChatMessageItem = {
        content: run.content,
        error_message: errorMessage,
        id: run.assistantMessageId,
        reply_to_message_id: run.retryOfMessageId ?? run.userMessageId ?? null,
        role: "assistant",
        sources_json: run.sources as ChatMessageItem["sources_json"],
        status,
      };

      if (run.userMessageId === null) {
        return [assistantMessage];
      }

      return [
        {
          content: run.userContent,
          ...(errorMessage ? { error_message: errorMessage } : {}),
          id: run.userMessageId,
          role: "user",
          sources_json: [],
          status,
        },
        assistantMessage,
      ];
    },
    [],
  );

  const finalizeStreamRun = useCallback(
    ({
      errorMessage,
      runId,
      sessionId,
      status,
    }: {
      errorMessage: string | null;
      runId: number;
      sessionId: number;
      status: StreamRunTerminalStatus;
    }) => {
      const currentRun = useChatStreamStore.getState().runsById[runId];
      const patched =
        currentRun == null
          ? false
          : patchPagedChatMessagesCache({
              appendIfMissing: buildTerminalMessages({
                errorMessage,
                run: currentRun,
                status,
              }),
              assistantMessageId: currentRun.assistantMessageId,
              patch: {
                content: currentRun.content,
                error_message: errorMessage,
                sources_json: currentRun.sources as ChatMessageItem["sources_json"],
                status,
              },
              queryClient,
              sessionId,
            });

      if (currentRun != null) {
        patchSessionContext({
          latestAssistantMessageId: currentRun.assistantMessageId,
          latestAssistantSources:
            currentRun.sources as ChatSessionContextItem["latest_assistant_sources"],
          sessionId,
        });
      }

      const refreshPromise = patched
        ? Promise.resolve()
        : queryClient.invalidateQueries({
            queryKey: queryKeys.chat.messagesWindow(sessionId),
          });
      void refreshPromise.then(() => {
        if (status === "failed" || currentSessionIdRef.current === sessionId) {
          pruneRuns([runId]);
        }
      });
    },
    [buildTerminalMessages, patchSessionContext, pruneRuns, queryClient],
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
              finalizeStreamRun({
                errorMessage: null,
                runId,
                sessionId,
                status: "succeeded",
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
              finalizeStreamRun({
                errorMessage,
                runId,
                sessionId,
                status: "failed",
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
      const persistedChatAttachments = toPersistedChatAttachments(serializedAttachments);
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
        const patched = patchUserMessageAttachments({
          attachments: persistedChatAttachments,
          sessionId,
          userMessageId: streamResult.userMessageId,
        });
        patchSessionContext({
          attachments: persistedChatAttachments,
          sessionId,
        });
        if (!patched) {
          await queryClient.invalidateQueries({
            queryKey: queryKeys.chat.messagesWindow(sessionId),
          });
        }
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
        await queryClient.invalidateQueries({
          queryKey: queryKeys.chat.context(resolvedActiveSessionId),
        });
      }
    },
    [queryClient, resolvedActiveSessionId],
  );

  const hasOlderMessages = messagesWindowQuery.hasNextPage ?? false;
  const isLoadingOlderMessages = messagesWindowQuery.isFetchingNextPage;
  const messagesWindowReady = resolvedActiveSessionId === null || !messagesWindowQuery.isPending;

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
    sessionsReady: !sessionsQuery.isPending && messagesWindowReady,
    setDraft,
    submitMessage,
    submitPending,
    isLoadingOlderMessages,
    loadOlderMessages,
    attachFiles,
    rejectFiles,
  };
}
