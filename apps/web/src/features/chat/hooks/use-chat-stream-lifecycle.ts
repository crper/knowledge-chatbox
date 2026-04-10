/**
 * @file 聊天流式生命周期 Hook 模块。
 */

import { useCallback } from "react";
import { useMutation } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";

import type { ChatMessageItem, ChatSessionContextItem, ChatSourceItem } from "../api/chat";
import { startChatStream, type ChatStreamAttachmentInput } from "../api/chat-stream";
import { CHAT_STREAM_EVENT } from "../api/chat-stream-events";
import type { useChatStreamRun } from "../hooks/use-chat-stream-run";
import { finalizeTerminalStreamRun } from "../utils/finalize-terminal-stream-run";
import { resolveSubmitErrorMessage } from "../utils/chat-submit-helpers";
type StreamRunTerminalStatus = "failed" | "succeeded";

type UseChatStreamLifecycleParams = {
  appendStartedUserMessage: (input: {
    content: string;
    sessionId: number;
    userMessageId: number;
  }) => void;
  currentSessionIdRef: React.RefObject<number | null>;
  invalidateMessagesWindow: (sessionId: number) => Promise<void>;
  patchAssistantMessage: (input: {
    appendIfMissing?: ChatMessageItem[];
    assistantMessageId: number;
    patch: {
      content?: string;
      error_message?: string | null;
      sources_json?: ChatSourceItem[] | null;
      status?: string;
    };
    sessionId: number;
  }) => boolean;
  patchRetriedUserMessage: (input: { sessionId: number; userMessageId: number }) => void;
  patchSessionContext: (input: {
    attachments?: ChatSessionContextItem["attachments"];
    latestAssistantMessageId?: number;
    latestAssistantSources?: ChatSessionContextItem["latest_assistant_sources"];
    sessionId: number;
  }) => void;
  streamRun: ReturnType<typeof useChatStreamRun>;
};

export function useChatStreamLifecycle({
  appendStartedUserMessage,
  currentSessionIdRef,
  invalidateMessagesWindow,
  patchAssistantMessage,
  patchRetriedUserMessage,
  patchSessionContext,
  streamRun,
}: UseChatStreamLifecycleParams) {
  const { t } = useTranslation(["chat", "common"]);

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
      void finalizeTerminalStreamRun({
        currentRun: streamRun.getRun(runId) ?? null,
        currentSessionId: currentSessionIdRef.current,
        errorMessage,
        invalidateMessagesWindow,
        patchAssistantMessage,
        patchRetriedUserMessage,
        patchSessionContext,
        sessionId,
        status,
      }).then((result) => {
        if (result.shouldPruneRun && result.runId !== null) {
          streamRun.pruneRuns([result.runId]);
        }
      });
    },
    [
      currentSessionIdRef,
      invalidateMessagesWindow,
      patchAssistantMessage,
      patchRetriedUserMessage,
      patchSessionContext,
      streamRun,
    ],
  );

  const sendMutation = useMutation({
    mutationFn: async ({
      attachments,
      content,
      retryOfMessageId,
      sessionId,
    }: {
      attachments?: ChatStreamAttachmentInput[];
      content: string;
      retryOfMessageId?: number;
      sessionId: number;
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

            if (event.event === CHAT_STREAM_EVENT.runStarted) {
              activeRunId = runId;
              const userMessageId =
                typeof event.data.user_message_id === "number" ? event.data.user_message_id : null;
              streamRun.startRun({
                runId,
                sessionId: Number(event.data.session_id ?? sessionId),
                assistantMessageId: Number(event.data.assistant_message_id ?? 0),
                retryOfMessageId: retryOfMessageId ?? null,
                userMessageId,
                userContent: content,
              });

              if (userMessageId !== null && retryOfMessageId == null) {
                appendStartedUserMessage({
                  content,
                  sessionId,
                  userMessageId,
                });
              }
              return;
            }

            if (event.event === CHAT_STREAM_EVENT.partTextDelta) {
              streamRun.appendDelta(
                runId,
                typeof event.data.delta === "string" ? event.data.delta : "",
              );
              return;
            }

            if (event.event === CHAT_STREAM_EVENT.partSource && event.data.source) {
              streamRun.addSource(runId, event.data.source as Record<string, unknown>); // TODO: 定义 ChatStreamSource 接口与后端 schema 对齐，替换 Record<string, unknown>
              return;
            }

            if (event.event === CHAT_STREAM_EVENT.runCompleted) {
              receivedTerminalRunEvent = true;
              streamRun.completeRun(runId);
              finalizeStreamRun({
                errorMessage: null,
                runId,
                sessionId,
                status: "succeeded",
              });
              return;
            }

            if (event.event === CHAT_STREAM_EVENT.runFailed) {
              receivedTerminalRunEvent = true;
              const errorMessage =
                typeof event.data.error_message === "string"
                  ? event.data.error_message
                  : t("assistantStreamingInterruptedError");
              streamRun.failRun(runId, errorMessage);
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
          streamRun.failRun(activeRunId, t("assistantStreamingInterruptedError"));
        } else {
          toast.error(resolveSubmitErrorMessage(error, t("messageSendFailedToast")));
        }

        throw error;
      }
    },
  });

  return {
    sendMutation,
  };
}
