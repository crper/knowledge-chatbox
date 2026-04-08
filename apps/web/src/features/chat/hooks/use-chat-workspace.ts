/**
 * @file 聊天相关 Hook 模块。
 */

import { useEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useChatAttachmentIntake } from "../hooks/use-chat-attachment-intake";
import { useChatBackgroundRunToasts } from "../hooks/use-chat-background-run-toasts";
import { useChatSessionCacheActions } from "../hooks/use-chat-session-cache-actions";
import { useChatWorkspaceActions } from "../hooks/use-chat-workspace-actions";
import { useChatRuntimeController } from "../hooks/use-chat-runtime-controller";
import { useChatStreamLifecycle } from "../hooks/use-chat-stream-lifecycle";
import { findStreamRunByAssistantMessageId } from "../utils/stream-run-query";
import { useChatWorkspaceViewModel } from "./use-chat-workspace-view-model";

/**
 * 封装聊天工作区的数据与交互。
 */
export function useChatWorkspace(activeSessionId: number | null) {
  const queryClient = useQueryClient();
  const currentSessionIdRef = useRef(activeSessionId);
  const [scrollToLatestRequestKey, setScrollToLatestRequestKey] = useState(0);

  const runtime = useChatRuntimeController();
  const { beginSessionSubmit, finishSessionSubmit, isSessionSubmitPending, streamRun } = runtime;

  const {
    activeSession,
    attachments,
    displayMessages,
    draft,
    hasOlderMessages,
    isLoadingOlderMessages,
    loadOlderMessages,
    messages,
    resolvedActiveSessionId,
    removeAttachment,
    sendShortcut,
    sessionsReady,
    setDraft,
    setSendShortcut,
    sessions,
    sessionsQuery,
    submitPending,
  } = useChatWorkspaceViewModel({
    activeSessionId,
    isSessionSubmitPending,
  });

  useEffect(() => {
    currentSessionIdRef.current = resolvedActiveSessionId;
  }, [resolvedActiveSessionId]);
  const {
    appendStartedUserMessage,
    invalidateSessionArtifacts,
    patchSessionContext,
    patchUserMessageAttachments,
  } = useChatSessionCacheActions();
  const { sendMutation } = useChatStreamLifecycle({
    appendStartedUserMessage,
    currentSessionIdRef,
    patchSessionContext,
    streamRun,
  });
  useChatBackgroundRunToasts({
    resolvedActiveSessionId,
    sessions,
    sessionsPending: sessionsQuery.isPending,
    streamRun,
  });
  const { deleteFailedMessage, editFailedMessage, retryMessage, submitMessage } =
    useChatWorkspaceActions({
      beginSessionSubmit,
      findRunByAssistantMessageId: (assistantMessageId) =>
        findStreamRunByAssistantMessageId(queryClient, assistantMessageId, resolvedActiveSessionId),
      finishSessionSubmit,
      invalidateSessionArtifacts,
      messages,
      patchSessionContext,
      patchUserMessageAttachments,
      requestScrollToLatest: () => {
        setScrollToLatestRequestKey((current) => current + 1);
      },
      resolvedActiveSessionId,
      sendStreamMessage: sendMutation.mutateAsync,
    });
  const { attachFiles, rejectFiles } = useChatAttachmentIntake({
    resolvedActiveSessionId,
  });

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
    sessionsReady,
    setDraft,
    submitMessage,
    submitPending,
    isLoadingOlderMessages,
    loadOlderMessages,
    attachFiles,
    rejectFiles,
  };
}
