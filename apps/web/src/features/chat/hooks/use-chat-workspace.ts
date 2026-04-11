/**
 * @file 聊天工作区装配层。
 *
 * Hooks 依赖图：
 *
 *   useChatWorkspace(activeSessionId)
 *   ├── useChatRuntimeController()
 *   │   ├── useChatSessionSubmitController()  ← 提交锁 (React local state)
 *   │   └── useChatStreamRun()               ← 流式运行 (QueryClient cache)
 *   ├── useChatRuntimeState()                ← 单实例订阅 StreamingRun 变更
 *   ├── useChatWorkspaceViewModel()
 *   │   ├── useChatComposerStore              ← 草稿/附件/快捷键 (Zustand, 仅草稿/快捷键持久化)
 *   │   └── useChatSessionData()
 *   │       ├── useQuery(sessions)            ← 会话列表
 *   │       └── useInfiniteQuery(messages)    ← 消息窗口
 *   ├── useChatSessionCacheActions()          ← patch/invalidate QueryCache
 *   ├── useChatStreamLifecycle()              ← SSE 流式发送 (useMutation)
 *   ├── useChatBackgroundRunToasts()          ← 后台完成通知
 *   ├── useChatWorkspaceActions()
 *   │   └── useChatComposerSubmit()           ← 提交/重试核心逻辑
 *   └── useChatAttachmentIntake()             ← 文件添加到附件 store
 */

import { useCallback, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { cancelChatRun, cancelPendingChatStream } from "../api/chat";
import { useChatAttachmentIntake } from "../hooks/use-chat-attachment-intake";
import { useChatBackgroundRunToasts } from "../hooks/use-chat-background-run-toasts";
import { useChatSessionCacheActions } from "../hooks/use-chat-session-cache-actions";
import { useChatWorkspaceActions } from "../hooks/use-chat-workspace-actions";
import { useChatRuntimeController } from "../hooks/use-chat-runtime-controller";
import { useChatRuntimeState } from "../hooks/use-chat-runtime-state";
import { useChatStreamLifecycle } from "../hooks/use-chat-stream-lifecycle";
import { findStreamRunByAssistantMessageId } from "../utils/stream-run-query";
import type { StreamingRun } from "../utils/streaming-run";
import { useChatWorkspaceViewModel } from "./use-chat-workspace-view-model";

type StopTargetRunInput = {
  resolvedActiveSessionId: number | null;
  sessionRunsById: Record<number, StreamingRun>;
  streamRun: Pick<ReturnType<typeof useChatRuntimeController>["streamRun"], "getAllRunsForSession">;
};

export function pickStopTargetRun({
  resolvedActiveSessionId,
  sessionRunsById,
  streamRun,
}: StopTargetRunInput): StreamingRun | null {
  if (resolvedActiveSessionId === null) {
    return null;
  }

  const runtimeRuns = streamRun
    .getAllRunsForSession(resolvedActiveSessionId)
    .filter(
      (run) =>
        run.terminalState == null && (run.status === "pending" || run.status === "streaming"),
    )
    .sort((left, right) => right.runId - left.runId);
  if (runtimeRuns[0]) {
    return runtimeRuns[0];
  }

  return (
    Object.values(sessionRunsById)
      .filter(
        (run) =>
          run.terminalState == null && (run.status === "pending" || run.status === "streaming"),
      )
      .sort((left, right) => right.runId - left.runId)[0] ?? null
  );
}

/**
 * 封装聊天工作区的数据与交互。
 */
export function useChatWorkspace(activeSessionId: number | null) {
  const queryClient = useQueryClient();
  const currentSessionIdRef = useRef(activeSessionId);
  const [scrollToLatestRequestKey, setScrollToLatestRequestKey] = useState(0);

  const runtime = useChatRuntimeController();
  const {
    abortSessionSubmit,
    beginSessionSubmit,
    finishSessionSubmit,
    getSessionSubmitState,
    isSessionSubmitPending,
    streamRun,
  } = runtime;

  const { allRuns, sessionRunsById } = useChatRuntimeState(activeSessionId);

  const {
    activeSession,
    attachments,
    displayMessages,
    draft,
    hasMessages,
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
    sessionRunsById,
  });
  currentSessionIdRef.current = resolvedActiveSessionId;

  const {
    appendStartedUserMessage,
    invalidateSessionArtifacts,
    patchAssistantMessage,
    patchRetriedUserMessage,
    patchSessionContext,
    patchUserMessageAttachments,
  } = useChatSessionCacheActions();
  const { sendMutation } = useChatStreamLifecycle({
    appendStartedUserMessage,
    currentSessionIdRef,
    invalidateMessagesWindow: invalidateSessionArtifacts,
    patchAssistantMessage,
    patchRetriedUserMessage,
    patchSessionContext,
    streamRun,
  });
  useChatBackgroundRunToasts({
    allRuns,
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
  const stopMessage = useCallback(() => {
    const activeRun = pickStopTargetRun({
      resolvedActiveSessionId,
      sessionRunsById,
      streamRun,
    });
    if (activeRun) {
      void cancelChatRun(activeRun.runId)
        .then(({ cancelled }) => {
          if (cancelled) {
            abortSessionSubmit(resolvedActiveSessionId);
          }
        })
        .catch(() => {});
      return;
    }

    const submitState = getSessionSubmitState(resolvedActiveSessionId);
    if (resolvedActiveSessionId !== null && submitState?.clientRequestId) {
      void cancelPendingChatStream(resolvedActiveSessionId, submitState.clientRequestId)
        .then(({ cancelled }) => {
          if (cancelled) {
            abortSessionSubmit(resolvedActiveSessionId);
          }
        })
        .catch(() => {});
      return;
    }

    abortSessionSubmit(resolvedActiveSessionId);
  }, [
    abortSessionSubmit,
    getSessionSubmitState,
    resolvedActiveSessionId,
    sessionRunsById,
    streamRun,
  ]);

  return {
    activeSession,
    activeSessionId: resolvedActiveSessionId,
    attachments,
    deleteFailedMessage,
    displayMessages,
    draft,
    editFailedMessage,
    hasMessages,
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
    stopMessage,
    isLoadingOlderMessages,
    loadOlderMessages,
    attachFiles,
    rejectFiles,
  };
}
