/**
 * @file 聊天流式生命周期 Hook 模块。
 */

import { useCallback } from "react";
import { useMutation } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";

import { isAbortError } from "@/lib/utils";
import { startChatStream, type ChatStreamAttachmentInput } from "../api/chat-stream";
import { CHAT_STREAM_EVENT, type ChatStreamEvent } from "../api/chat-stream-events";
import type { ChatRuntime } from "../runtime/chat-runtime";
import type { ChatCacheWriter } from "../utils/chat-cache-writer";
import { finalizeTerminalStreamRun } from "../utils/finalize-terminal-stream-run";
import { parseChatSourceItem } from "../utils/chat-source";
import { resolveSubmitErrorMessage } from "../utils/chat-submit-helpers";

type StreamRunTerminalStatus = "failed" | "succeeded";

type FinalizeStreamRunParams = {
  errorMessage: string | null;
  reason?: "failed" | "stopped" | "succeeded";
  runId: number;
  sessionId: number;
  status: StreamRunTerminalStatus;
};

export type StreamLifecycleState = {
  activeRunId: number | null;
  receivedTerminalRunEvent: boolean;
};

type StreamEventHandlerDeps = {
  cacheWriter: Pick<ChatCacheWriter, "appendStartedUserMessage">;
  content: string;
  finalizeStreamRun: (params: FinalizeStreamRunParams) => void;
  retryOfMessageId?: number;
  runtime: Pick<ChatRuntime, "addSource" | "appendDelta" | "completeRun" | "failRun" | "startRun">;
  sessionId: number;
  t: (key: string) => string;
};

/**
 * 处理单个 SSE 流式事件，更新运行时状态并触发缓存写入。
 * @param event - SSE 事件
 * @param deps - 事件处理依赖（runtime、cacheWriter、翻译函数等）
 * @param state - 可变的流生命周期状态，函数会就地修改此对象
 */
export function handleStreamEvent(
  event: ChatStreamEvent,
  deps: StreamEventHandlerDeps,
  state: StreamLifecycleState,
): void {
  const runId = Number(event.data.run_id ?? 0);

  if (event.event === CHAT_STREAM_EVENT.runStarted) {
    state.activeRunId = runId;
    const userMessageId =
      typeof event.data.user_message_id === "number" ? event.data.user_message_id : null;
    deps.runtime.startRun({
      runId,
      sessionId: Number(event.data.session_id ?? deps.sessionId),
      assistantMessageId: Number(event.data.assistant_message_id ?? 0),
      retryOfMessageId: deps.retryOfMessageId ?? null,
      userMessageId,
      userContent: deps.content,
    });

    if (userMessageId !== null && deps.retryOfMessageId == null) {
      deps.cacheWriter.appendStartedUserMessage({
        content: deps.content,
        sessionId: deps.sessionId,
        userMessageId,
      });
    }
    return;
  }

  if (event.event === CHAT_STREAM_EVENT.partTextDelta) {
    deps.runtime.appendDelta(runId, typeof event.data.delta === "string" ? event.data.delta : "");
    return;
  }

  if (event.event === CHAT_STREAM_EVENT.partSource && event.data.source) {
    const source = parseChatSourceItem(event.data.source);
    if (source !== null) {
      deps.runtime.addSource(runId, source);
    }
    return;
  }

  if (event.event === CHAT_STREAM_EVENT.runCompleted) {
    state.receivedTerminalRunEvent = true;
    deps.runtime.completeRun(runId);
    deps.finalizeStreamRun({
      errorMessage: null,
      reason: "succeeded",
      runId,
      sessionId: deps.sessionId,
      status: "succeeded",
    });
    return;
  }

  if (event.event === CHAT_STREAM_EVENT.runFailed) {
    state.receivedTerminalRunEvent = true;
    const errorMessage =
      typeof event.data.error_message === "string"
        ? event.data.error_message
        : deps.t("assistantStreamingInterruptedError");
    deps.runtime.failRun(runId, errorMessage);
    deps.finalizeStreamRun({
      errorMessage,
      reason: "failed",
      runId,
      sessionId: deps.sessionId,
      status: "failed",
    });
  }
}

type UseChatStreamLifecycleParams = {
  cacheWriter: Pick<
    ChatCacheWriter,
    | "appendStartedUserMessage"
    | "invalidateSessionArtifacts"
    | "patchAssistantMessage"
    | "patchRetriedUserMessage"
    | "patchSessionContext"
  >;
  currentSessionIdRef: React.RefObject<number | null>;
  runtime: Pick<
    ChatRuntime,
    | "addSource"
    | "appendDelta"
    | "completeRun"
    | "failRun"
    | "getRun"
    | "pruneRuns"
    | "startRun"
    | "stopRun"
  >;
};

export function useChatStreamLifecycle({
  cacheWriter,
  currentSessionIdRef,
  runtime,
}: UseChatStreamLifecycleParams) {
  const { t } = useTranslation(["chat", "common"]);

  const finalizeStreamRun = useCallback(
    ({ errorMessage, reason, runId, sessionId, status }: FinalizeStreamRunParams) => {
      void finalizeTerminalStreamRun({
        cacheWriter,
        currentRun: runtime.getRun(runId) ?? null,
        currentSessionId: currentSessionIdRef.current,
        errorMessage,
        reason,
        sessionId,
        status,
      }).then((result) => {
        if (result.shouldPruneRun && result.runId !== null) {
          runtime.pruneRuns([result.runId]);
        }
      });
    },
    [cacheWriter, currentSessionIdRef, runtime],
  );

  const sendMutation = useMutation({
    mutationFn: async ({
      attachments,
      clientRequestId,
      content,
      retryOfMessageId,
      sessionId,
      signal,
    }: {
      attachments?: ChatStreamAttachmentInput[];
      clientRequestId: string;
      content: string;
      retryOfMessageId?: number;
      sessionId: number;
      signal?: AbortSignal;
    }) => {
      const streamState: StreamLifecycleState = {
        activeRunId: null,
        receivedTerminalRunEvent: false,
      };
      const stoppedErrorMessage = t("assistantStreamingStoppedError");

      try {
        return await startChatStream({
          sessionId,
          body: {
            attachments,
            content,
            client_request_id: clientRequestId,
            retry_of_message_id: retryOfMessageId,
          },
          signal,
          onEvent: (event) => {
            if (signal?.aborted) {
              return;
            }
            handleStreamEvent(
              event,
              {
                cacheWriter,
                content,
                finalizeStreamRun,
                retryOfMessageId,
                runtime,
                sessionId,
                t,
              },
              streamState,
            );
          },
        });
      } catch (error) {
        const resolvedErrorMessage = resolveSubmitErrorMessage(error, t("messageSendFailedToast"));
        if (isAbortError(error)) {
          if (streamState.activeRunId !== null && !streamState.receivedTerminalRunEvent) {
            runtime.stopRun(streamState.activeRunId, stoppedErrorMessage);
            finalizeStreamRun({
              errorMessage: stoppedErrorMessage,
              reason: "stopped",
              runId: streamState.activeRunId,
              sessionId,
              status: "failed",
            });
          }

          throw error;
        }

        if (streamState.activeRunId !== null && !streamState.receivedTerminalRunEvent) {
          runtime.failRun(streamState.activeRunId, t("assistantStreamingInterruptedError"));
        } else if (resolvedErrorMessage !== stoppedErrorMessage) {
          toast.error(resolvedErrorMessage);
        }

        throw error;
      }
    },
  });

  return {
    sendMutation,
  };
}
