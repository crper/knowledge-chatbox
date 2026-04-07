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
import type { StreamingRun } from "../store/chat-stream-store";
import { patchPagedChatMessagesCache } from "../utils/patch-paged-chat-messages";
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

  const patchRetriedUserMessage = useCallback(
    ({ sessionId, userMessageId }: { sessionId: number; userMessageId: number }) => {
      queryClient.setQueryData<InfiniteData<ChatMessageItem[], number | null>>(
        queryKeys.chat.messagesWindow(sessionId),
        (current) => {
          if (!current || typeof current !== "object" || !("pages" in current)) {
            return current;
          }

          let patched = false;
          const nextPages = current.pages.map((page) =>
            page.map((message) => {
              if (message.id !== userMessageId || message.role !== MessageRole.USER) {
                return message;
              }

              patched = true;
              return {
                ...message,
                error_message: null,
                status: MessageStatus.SUCCEEDED,
              } satisfies ChatMessageItem;
            }),
          );

          return patched ? { ...current, pages: nextPages } : current;
        },
      );
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
      run: StreamingRun;
      status: StreamRunTerminalStatus;
    }): ChatMessageItem[] => {
      const assistantMessage: ChatMessageItem = {
        content: run.content,
        error_message: errorMessage,
        id: run.assistantMessageId,
        reply_to_message_id: run.retryOfMessageId ?? run.userMessageId ?? null,
        role: MessageRole.ASSISTANT,
        sources_json: run.sources as ChatMessageItem["sources_json"],
        status,
      };

      if (run.userMessageId === null) {
        return [assistantMessage];
      }

      if (run.retryOfMessageId != null) {
        return [assistantMessage];
      }

      return [
        {
          content: run.userContent,
          ...(errorMessage ? { error_message: errorMessage } : {}),
          id: run.userMessageId,
          role: MessageRole.USER,
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
      const currentRun = streamRun.getRun(runId);
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
        if (status === MessageStatus.SUCCEEDED && currentRun.retryOfMessageId != null) {
          patchRetriedUserMessage({
            sessionId,
            userMessageId: currentRun.retryOfMessageId,
          });
        }

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
        if (status === MessageStatus.FAILED || currentSessionIdRef.current === sessionId) {
          streamRun.pruneRuns([runId]);
        }
      });
    },
    [
      buildTerminalMessages,
      currentSessionIdRef,
      patchRetriedUserMessage,
      patchSessionContext,
      queryClient,
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
