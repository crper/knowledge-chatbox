/**
 * @file 聊天流式生命周期 Hook 模块。
 */

import { useCallback } from "react";
import { useMutation, useQueryClient, type InfiniteData } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";

import { queryKeys } from "@/lib/api/query-keys";
import type { ChatMessageItem, ChatSessionContextItem, ChatSourceItem } from "../api/chat";
import { startChatStream, type ChatStreamAttachmentInput } from "../api/chat-stream";
import { CHAT_STREAM_EVENT } from "../api/chat-stream-events";
import type { useChatStreamRun } from "../hooks/use-chat-stream-run";
import { finalizeTerminalStreamRun } from "../utils/finalize-terminal-stream-run";
import { resolveSubmitErrorMessage } from "../utils/chat-submit-helpers";
import { MessageRole, MessageStatus } from "../constants";

type StreamRunTerminalStatus = "failed" | "succeeded";

type UseChatStreamLifecycleParams = {
  currentSessionIdRef: React.RefObject<number | null>;
  patchSessionContext: (input: {
    attachments?: ChatSessionContextItem["attachments"];
    latestAssistantMessageId?: number;
    latestAssistantSources?: ChatSessionContextItem["latest_assistant_sources"];
    sessionId: number;
  }) => void;
  streamRun: ReturnType<typeof useChatStreamRun>;
};

export function useChatStreamLifecycle({
  currentSessionIdRef,
  patchSessionContext,
  streamRun,
}: UseChatStreamLifecycleParams) {
  const { t } = useTranslation(["chat", "common"]);
  const queryClient = useQueryClient();

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
        patchSessionContext,
        queryClient,
        sessionId,
        status,
      }).then((result) => {
        if (result.shouldPruneRun && result.runId !== null) {
          streamRun.pruneRuns([result.runId]);
        }
      });
    },
    [currentSessionIdRef, patchSessionContext, queryClient, streamRun],
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
                        role: MessageRole.USER,
                        status: MessageStatus.SUCCEEDED,
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

            if (
              event.event === CHAT_STREAM_EVENT.partTextDelta ||
              event.event === CHAT_STREAM_EVENT.legacyMessageDelta
            ) {
              streamRun.appendDelta(
                runId,
                typeof event.data.delta === "string" ? event.data.delta : "",
              );
              return;
            }

            if (event.event === CHAT_STREAM_EVENT.partSource && event.data.source) {
              streamRun.addSource(runId, event.data.source as Record<string, unknown>);
              return;
            }

            if (
              event.event === CHAT_STREAM_EVENT.legacySourcesFinal &&
              Array.isArray(event.data.sources)
            ) {
              for (const source of event.data.sources) {
                streamRun.addSource(runId, source as ChatSourceItem as Record<string, unknown>);
              }
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
