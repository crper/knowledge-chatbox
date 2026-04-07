/**
 * @file 聊天相关 Hook 模块。
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import type { FileRejection } from "react-dropzone";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";

import { detectSupportedUploadKind } from "@/features/knowledge/upload-file-types";
import { queryKeys } from "@/lib/api/query-keys";
import { getDocumentUploadRejectionMessage } from "@/lib/document-upload";
import { deleteChatMessage, type ChatMessageItem } from "../api/chat";
import { useChatComposerSubmit } from "../hooks/use-chat-composer-submit";
import { useChatSessionData } from "../hooks/use-chat-session-data";
import { useChatSessionSubmitController } from "../hooks/use-chat-session-submit-controller";
import { useChatStreamLifecycle } from "../hooks/use-chat-stream-lifecycle";
import { useChatStreamRun } from "../hooks/use-chat-stream-run";
import { useChatUiStore } from "../store/chat-ui-store";
import {
  buildLocalAttachmentFingerprint,
  collectLocalAttachmentFingerprints,
} from "../utils/chat-submit-helpers";
import { resolveSessionTitle } from "../utils/session-title";
import {
  findStreamRunByAssistantMessageId,
  getStreamRunEntries,
  subscribeToStreamRunChanges,
} from "../utils/stream-run-query";

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
  const draftsBySession = useChatUiStore((state) => state.draftsBySession);
  const removeAttachment = useChatUiStore((state) => state.removeAttachment);
  const sendShortcut = useChatUiStore((state) => state.sendShortcut);
  const setSendShortcut = useChatUiStore((state) => state.setSendShortcut);
  const setDraft = useChatUiStore((state) => state.setDraft);

  const { beginSessionSubmit, finishSessionSubmit, isSessionSubmitPending } =
    useChatSessionSubmitController();

  const {
    activeSession,
    displayMessages,
    hasOlderMessages,
    isLoadingOlderMessages,
    loadOlderMessages,
    messages,
    messagesWindowReady,
    patchSessionContext,
    patchUserMessageAttachments,
    resolvedActiveSessionId,
    sessions,
    sessionsQuery,
  } = useChatSessionData(activeSessionId);

  useEffect(() => {
    currentSessionIdRef.current = resolvedActiveSessionId;
  }, [resolvedActiveSessionId]);
  const streamRun = useChatStreamRun();
  const { sendMutation } = useChatStreamLifecycle({
    currentSessionIdRef,
    patchSessionContext,
    streamRun,
  });
  const { retryMessage, submitMessage } = useChatComposerSubmit({
    beginSessionSubmit,
    finishSessionSubmit,
    findRunByAssistantMessageId: (assistantMessageId) =>
      findStreamRunByAssistantMessageId(queryClient, assistantMessageId, resolvedActiveSessionId),
    messages,
    patchSessionContext,
    patchUserMessageAttachments,
    requestScrollToLatest: () => {
      setScrollToLatestRequestKey((current) => current + 1);
    },
    resolvedActiveSessionId,
    sendStreamMessage: sendMutation.mutateAsync,
  });

  const attachments =
    resolvedActiveSessionId === null
      ? []
      : (attachmentsBySession[String(resolvedActiveSessionId)] ?? []);
  const draft =
    resolvedActiveSessionId === null
      ? ""
      : (draftsBySession[String(resolvedActiveSessionId)] ?? "");
  const submitPending = isSessionSubmitPending(resolvedActiveSessionId);

  useEffect(() => {
    if (sessionsQuery.isPending || sessions.length === 0) {
      return;
    }

    const checkBackgroundRuns = () => {
      getStreamRunEntries(queryClient).forEach(([, run]) => {
        if (
          !run ||
          run.status !== "succeeded" ||
          run.toastShown ||
          run.sessionId === resolvedActiveSessionId
        ) {
          return;
        }

        const session = sessions.find((item) => item.id === run.sessionId);
        const title = resolveSessionTitle(session?.title, t("sessionTitleFallback"));
        toast.success(t("backgroundSessionCompletedToast", { title }));
        streamRun.markToastShown(run.runId);
        streamRun.removeRun(run.runId);
      });
    };

    // 立即检查一次
    checkBackgroundRuns();

    // 订阅 Query Cache 变化，当有 run 更新时再次检查
    const unsubscribe = subscribeToStreamRunChanges(queryClient, checkBackgroundRuns);

    return () => {
      unsubscribe();
    };
  }, [queryClient, resolvedActiveSessionId, sessions, sessionsQuery.isPending, streamRun, t]);

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
