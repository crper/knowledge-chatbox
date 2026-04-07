/**
 * @file 聊天相关 Hook 模块。
 */

import { useEffect, useRef, useState } from "react";
import { useChatAttachmentIntake } from "../hooks/use-chat-attachment-intake";
import { useChatBackgroundRunToasts } from "../hooks/use-chat-background-run-toasts";
import { useChatWorkspaceActions } from "../hooks/use-chat-workspace-actions";
import { useChatSessionSubmitController } from "../hooks/use-chat-session-submit-controller";
import { useChatStreamRun } from "../hooks/use-chat-stream-run";
import { useChatWorkspaceViewModel } from "./use-chat-workspace-view-model";

/**
 * 封装聊天工作区的数据与交互。
 */
export function useChatWorkspace(activeSessionId: number | null) {
  const currentSessionIdRef = useRef(activeSessionId);
  const [scrollToLatestRequestKey, setScrollToLatestRequestKey] = useState(0);

  const { beginSessionSubmit, finishSessionSubmit, isSessionSubmitPending } =
    useChatSessionSubmitController();

  const {
    activeSession,
    attachments,
    displayMessages,
    draft,
    hasOlderMessages,
    isLoadingOlderMessages,
    loadOlderMessages,
    messages,
    patchSessionContext,
    patchUserMessageAttachments,
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
  const streamRun = useChatStreamRun();
  useChatBackgroundRunToasts({
    resolvedActiveSessionId,
    sessions,
    sessionsPending: sessionsQuery.isPending,
    streamRun,
  });
  const { deleteFailedMessage, editFailedMessage, retryMessage, submitMessage } =
    useChatWorkspaceActions({
      beginSessionSubmit,
      currentSessionIdRef,
      finishSessionSubmit,
      messages,
      patchSessionContext,
      patchUserMessageAttachments,
      requestScrollToLatest: () => {
        setScrollToLatestRequestKey((current) => current + 1);
      },
      resolvedActiveSessionId,
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
