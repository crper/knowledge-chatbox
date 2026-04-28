/**
 * @file 聊天工作区装配层。
 *
 * Hooks 依赖图：
 *
 *   useChatWorkspace(activeSessionId)
 *   ├── useChatRuntime()                  ← 运行态 owner（提交锁 + stream run 读写）
 *   ├── useChatWorkspaceViewModel()
 *   │   ├── useChatComposerStore              ← 草稿/附件/快捷键 (Zustand, 仅草稿/快捷键持久化)
 *   │   └── useChatSessionData()
 *   │       ├── useQuery(sessions)            ← 会话列表
 *   │       └── useInfiniteQuery(messages)    ← 消息窗口
 *   ├── createChatCacheWriter()            ← Query cache 唯一写出口
 *   ├── useChatStreamLifecycle()              ← SSE 流式发送 (useMutation)
 *   ├── useChatBackgroundRunToasts()          ← 后台完成通知
 *   ├── useChatWorkspaceActions()
 *   │   └── useChatComposerSubmit()           ← 提交/重试核心逻辑
 *   └── useChatAttachmentIntake()             ← 文件添加到附件 store
 */

import { useCallback, useMemo, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { orderBy } from "es-toolkit";
import { cancelChatRun, cancelPendingChatStream } from "../api/chat";
import { useChatAttachmentIntake } from "../hooks/use-chat-attachment-intake";
import { useChatBackgroundRunToasts } from "../hooks/use-chat-background-run-toasts";
import { useChatRuntime } from "../hooks/use-chat-runtime";
import { useChatWorkspaceActions } from "../hooks/use-chat-workspace-actions";
import { useChatStreamLifecycle } from "../hooks/use-chat-stream-lifecycle";
import { createChatCacheWriter } from "../utils/chat-cache-writer";
import type { ChatRuntime } from "../runtime/chat-runtime";
import { findStreamRunByAssistantMessageId } from "../utils/stream-run-query";
import type { StreamingRun } from "../utils/streaming-run";
import { useChatWorkspaceViewModel } from "./use-chat-workspace-view-model";

type StopTargetRunInput = {
  resolvedActiveSessionId: number | null;
  sessionRunsById: Record<number, StreamingRun>;
  runtime: Pick<ChatRuntime, "getAllRunsForSession">;
};

export function pickStopTargetRun({
  resolvedActiveSessionId,
  runtime,
  sessionRunsById,
}: StopTargetRunInput): StreamingRun | null {
  if (resolvedActiveSessionId === null) {
    return null;
  }

  const runtimeRuns = orderBy(
    runtime
      .getAllRunsForSession(resolvedActiveSessionId)
      .filter(
        (run) =>
          run.terminalState == null && (run.status === "pending" || run.status === "streaming"),
      ),
    [(run) => run.runId],
    ["desc"],
  );
  if (runtimeRuns[0]) {
    return runtimeRuns[0];
  }

  return (
    orderBy(
      Object.values(sessionRunsById).filter(
        (run) =>
          run.terminalState == null && (run.status === "pending" || run.status === "streaming"),
      ),
      [(run) => run.runId],
      ["desc"],
    )[0] ?? null
  );
}

/**
 * 封装聊天工作区的数据与交互。
 */
export function useChatWorkspace(activeSessionId: number | null) {
  const queryClient = useQueryClient();
  const currentSessionIdRef = useRef(activeSessionId);
  const [scrollToLatestRequestKey, setScrollToLatestRequestKey] = useState(0);

  const runtime = useChatRuntime(activeSessionId);

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
    isSessionSubmitPending: runtime.isSubmitPending,
    sessionRunsById: runtime.sessionRunsById,
  });
  currentSessionIdRef.current = resolvedActiveSessionId;

  const cacheWriter = useMemo(() => createChatCacheWriter(queryClient), [queryClient]);
  const { sendMutation } = useChatStreamLifecycle({
    cacheWriter,
    currentSessionIdRef,
    runtime,
  });
  useChatBackgroundRunToasts({
    allRuns: runtime.allRuns,
    resolvedActiveSessionId,
    runtime,
    sessions,
    sessionsPending: sessionsQuery.isPending,
  });
  const { deleteFailedMessage, editFailedMessage, retryMessage, submitMessage } =
    useChatWorkspaceActions({
      cacheWriter,
      findRunByAssistantMessageId: (assistantMessageId) =>
        findStreamRunByAssistantMessageId(queryClient, assistantMessageId, resolvedActiveSessionId),
      messages,
      requestScrollToLatest: () => {
        setScrollToLatestRequestKey((current) => current + 1);
      },
      resolvedActiveSessionId,
      runtime,
      sendStreamMessage: sendMutation.mutateAsync,
    });
  const { attachFiles, rejectFiles } = useChatAttachmentIntake({
    resolvedActiveSessionId,
  });
  const stopMessage = useCallback(() => {
    const activeRun = pickStopTargetRun({
      resolvedActiveSessionId,
      runtime,
      sessionRunsById: runtime.sessionRunsById,
    });
    if (activeRun) {
      void cancelChatRun(activeRun.runId)
        .then(({ cancelled }) => {
          if (cancelled) {
            runtime.abortSubmit(resolvedActiveSessionId);
          }
        })
        .catch(() => {});
      return;
    }

    const submitState = runtime.getSubmitState(resolvedActiveSessionId);
    if (resolvedActiveSessionId !== null && submitState?.clientRequestId) {
      void cancelPendingChatStream(resolvedActiveSessionId, submitState.clientRequestId)
        .then(({ cancelled }) => {
          if (cancelled) {
            runtime.abortSubmit(resolvedActiveSessionId);
          }
        })
        .catch(() => {});
      return;
    }

    runtime.abortSubmit(resolvedActiveSessionId);
  }, [resolvedActiveSessionId, runtime]);

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
