/**
 * @file 聊天相关 Hook 模块。
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { FileRejection } from "react-dropzone";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";

import { chatMessagesQueryOptions, chatSessionsQueryOptions } from "@/features/chat/api/chat-query";
import { uploadDocument } from "@/features/knowledge/api/documents";
import { detectSupportedUploadKind } from "@/features/knowledge/upload-file-types";
import { queryKeys } from "@/lib/api/query-keys";
import { getDocumentUploadRejectionMessage, runDocumentUpload } from "@/lib/document-upload";
import { deleteChatMessage, type ChatMessageItem } from "../api/chat";
import { startChatStream, type ChatStreamAttachmentInput } from "../api/chat-stream";
import { useChatStreamStore } from "../store/chat-stream-store";
import { useChatUiStore, type ChatAttachmentItem } from "../store/chat-ui-store";
import { buildDisplayMessages } from "../utils/build-display-messages";
import { resolveSessionTitle } from "../utils/session-title";

type ReadyChatAttachment = ChatAttachmentItem & {
  file: File;
  kind: "image" | "document";
  mimeType: string;
  resourceDocumentId: number;
  resourceDocumentVersionId: number;
  status: "uploaded";
};

function serializeChatAttachments(attachments: ReadyChatAttachment[]): ChatStreamAttachmentInput[] {
  return attachments.map((attachment) => ({
    attachment_id: attachment.id,
    type: attachment.kind,
    name: attachment.name,
    mime_type: attachment.mimeType,
    size_bytes: attachment.sizeBytes ?? attachment.file.size,
    document_id: attachment.resourceDocumentId,
    document_revision_id: attachment.resourceDocumentVersionId,
  }));
}

function cloneChatAttachments(attachments: ChatAttachmentItem[]) {
  return attachments.map((attachment) => ({ ...attachment }));
}

function buildLocalAttachmentFingerprint(file: File) {
  return [file.name, file.type, file.size, file.lastModified].join("::");
}

function collectLocalAttachmentFingerprints(attachments: ChatAttachmentItem[]) {
  return new Set(
    attachments.flatMap((attachment) =>
      attachment.file instanceof File ? [buildLocalAttachmentFingerprint(attachment.file)] : [],
    ),
  );
}

function toReadyAttachment(attachment: ChatAttachmentItem): ReadyChatAttachment | null {
  if (
    attachment.status !== "uploaded" ||
    !(attachment.file instanceof File) ||
    !attachment.mimeType ||
    typeof attachment.resourceDocumentId !== "number" ||
    typeof attachment.resourceDocumentVersionId !== "number"
  ) {
    return null;
  }

  return {
    ...attachment,
    file: attachment.file,
    mimeType: attachment.mimeType,
    resourceDocumentId: attachment.resourceDocumentId,
    resourceDocumentVersionId: attachment.resourceDocumentVersionId,
    status: "uploaded",
  };
}

function resolveSubmitErrorMessage(error: unknown, fallback: string) {
  if (!(error instanceof Error)) {
    return fallback;
  }

  const message = error.message.trim();
  if (!message || message === "chat stream request failed") {
    return fallback;
  }

  return message;
}

function toComposerAttachmentSignature(attachment: ChatAttachmentItem) {
  return JSON.stringify({
    attachmentId: attachment.id,
    documentId: attachment.resourceDocumentId ?? null,
    documentRevisionId: attachment.resourceDocumentVersionId ?? null,
    kind: attachment.kind,
    mimeType: attachment.mimeType ?? null,
    name: attachment.name,
    sizeBytes: attachment.sizeBytes ?? null,
  });
}

function toMessageAttachmentSignature(
  attachment: NonNullable<ChatMessageItem["attachments_json"]>[number],
) {
  return JSON.stringify({
    attachmentId: attachment.attachment_id,
    documentId: attachment.resource_document_id ?? null,
    documentRevisionId: attachment.resource_document_version_id ?? null,
    kind: attachment.type,
    mimeType: attachment.mime_type,
    name: attachment.name,
    sizeBytes: attachment.size_bytes,
  });
}

function shouldResetComposerSnapshotForRetry({
  composerAttachments,
  composerDraft,
  retryAttachments,
  retryContent,
}: {
  composerAttachments: ChatAttachmentItem[];
  composerDraft: string;
  retryAttachments: ChatMessageItem["attachments_json"];
  retryContent: string;
}) {
  if (composerDraft.trim() !== retryContent.trim()) {
    return false;
  }

  const normalizedComposerAttachments = composerAttachments
    .map(toComposerAttachmentSignature)
    .sort();
  const normalizedRetryAttachments = (retryAttachments ?? [])
    .map(toMessageAttachmentSignature)
    .sort();

  if (normalizedComposerAttachments.length !== normalizedRetryAttachments.length) {
    return false;
  }

  return normalizedComposerAttachments.every(
    (attachmentSignature, index) => attachmentSignature === normalizedRetryAttachments[index],
  );
}

/**
 * 封装聊天工作区的数据与交互。
 */
export function useChatWorkspace(activeSessionId: number | null) {
  const { t } = useTranslation(["chat", "common"]);
  const queryClient = useQueryClient();
  const submitPendingSessionIdsRef = useRef<Set<number>>(new Set());
  const currentSessionIdRef = useRef(activeSessionId);
  const [submitPendingSessionIds, setSubmitPendingSessionIds] = useState<number[]>([]);
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

  const sessionsQuery = useQuery(chatSessionsQueryOptions());
  const sessions = Array.isArray(sessionsQuery.data) ? sessionsQuery.data : [];
  const resolvedActiveSessionId = useMemo(() => {
    if (activeSessionId === null || sessionsQuery.isPending) {
      return null;
    }

    return sessions.some((session) => session.id === activeSessionId) ? activeSessionId : null;
  }, [activeSessionId, sessions, sessionsQuery.isPending]);
  const messagesQuery = useQuery(chatMessagesQueryOptions(resolvedActiveSessionId));

  useEffect(() => {
    currentSessionIdRef.current = resolvedActiveSessionId;
  }, [resolvedActiveSessionId]);

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
              startRun({
                runId,
                sessionId: Number(event.data.session_id ?? sessionId),
                assistantMessageId: Number(event.data.assistant_message_id ?? 0),
                retryOfMessageId: retryOfMessageId ?? null,
                userMessageId:
                  typeof event.data.user_message_id === "number"
                    ? event.data.user_message_id
                    : null,
                userContent: content,
              });
              return;
            }

            if (event.event === "part.text.delta") {
              appendDelta(runId, typeof event.data.delta === "string" ? event.data.delta : "");
              return;
            }

            if (event.event === "part.source" && event.data.source) {
              addSource(runId, event.data.source as Record<string, unknown>);
              return;
            }

            if (event.event === "run.completed") {
              receivedTerminalRunEvent = true;
              completeRun(runId);
              void queryClient
                .invalidateQueries({
                  queryKey: queryKeys.chat.messages(sessionId),
                })
                .then(() => {
                  if (currentSessionIdRef.current === sessionId) {
                    pruneRuns([runId]);
                  }
                });
              return;
            }

            if (event.event === "run.failed") {
              receivedTerminalRunEvent = true;
              failRun(
                runId,
                typeof event.data.error_message === "string"
                  ? event.data.error_message
                  : t("assistantStreamingInterruptedError"),
              );
              void queryClient
                .invalidateQueries({
                  queryKey: queryKeys.chat.messages(sessionId),
                })
                .then(() => {
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

  const messages = Array.isArray(messagesQuery.data) ? messagesQuery.data : [];
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
  const submitPending =
    resolvedActiveSessionId !== null && submitPendingSessionIds.includes(resolvedActiveSessionId);

  const beginSessionSubmit = useCallback((sessionId: number) => {
    if (submitPendingSessionIdsRef.current.has(sessionId)) {
      return false;
    }

    submitPendingSessionIdsRef.current.add(sessionId);
    setSubmitPendingSessionIds((current) =>
      current.includes(sessionId) ? current : [...current, sessionId],
    );
    return true;
  }, []);

  const finishSessionSubmit = useCallback((sessionId: number) => {
    if (!submitPendingSessionIdsRef.current.has(sessionId)) {
      return;
    }

    submitPendingSessionIdsRef.current.delete(sessionId);
    setSubmitPendingSessionIds((current) => current.filter((item) => item !== sessionId));
  }, []);

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
      const persistedAttachments: ReadyChatAttachment[] = [];
      let uploadedCount = 0;
      for (const attachment of workingAttachments.filter((item) => item.status !== "failed")) {
        const readyAttachment = toReadyAttachment(attachment);
        if (readyAttachment) {
          persistedAttachments.push(readyAttachment);
          continue;
        }

        if (attachment.status !== "queued" || !attachment.file || !attachment.mimeType) {
          continue;
        }

        try {
          const document = await runDocumentUpload({
            failedMessage: t("attachmentUploadFailed"),
            file: attachment.file,
            onPatch: (patch) => {
              Object.assign(attachment, patch);
            },
            upload: uploadDocument,
          });

          attachment.errorMessage = undefined;
          attachment.progress = 100;
          attachment.resourceDocumentId = document.document_id;
          attachment.resourceDocumentVersionId = document.id;
          attachment.status = "uploaded";

          uploadedCount += 1;
          const nextReadyAttachment = toReadyAttachment(attachment);
          if (nextReadyAttachment) {
            persistedAttachments.push(nextReadyAttachment);
          }
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : t("attachmentUploadFailed");
          attachment.errorMessage = errorMessage;
          attachment.progress = 0;
          attachment.status = "failed";
          toast.error(errorMessage);
          throw error;
        }
      }

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
        await queryClient.invalidateQueries({ queryKey: queryKeys.chat.messages(sessionId) });
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
          queryKey: queryKeys.chat.messages(resolvedActiveSessionId),
        });
      }
    },
    [queryClient, resolvedActiveSessionId],
  );

  return {
    activeSession,
    activeSessionId: resolvedActiveSessionId,
    attachments,
    deleteFailedMessage,
    displayMessages,
    draft,
    editFailedMessage,
    hasMessages: displayMessages.length > 0,
    removeAttachment,
    retryMessage,
    scrollToLatestRequestKey,
    sendShortcut,
    setSendShortcut,
    sessions,
    sessionsReady: !sessionsQuery.isPending,
    setDraft,
    submitMessage,
    submitPending,
    attachFiles,
    rejectFiles,
  };
}
