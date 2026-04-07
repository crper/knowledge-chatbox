import type { QueryClient } from "@tanstack/react-query";

import type { ChatMessageItem, ChatSessionContextItem } from "../api/chat";
import { queryKeys } from "@/lib/api/query-keys";
import type { StreamingRun } from "../store/chat-stream-store";
import { MessageRole, MessageStatus } from "../constants";
import { patchPagedChatMessagesCache } from "./patch-paged-chat-messages";

type StreamRunTerminalStatus = "failed" | "succeeded";

type FinalizeTerminalStreamRunInput = {
  currentRun: StreamingRun | null;
  currentSessionId: number | null;
  errorMessage: string | null;
  patchSessionContext: (input: {
    attachments?: ChatSessionContextItem["attachments"];
    latestAssistantMessageId?: number;
    latestAssistantSources?: ChatSessionContextItem["latest_assistant_sources"];
    sessionId: number;
  }) => void;
  queryClient: QueryClient;
  sessionId: number;
  status: StreamRunTerminalStatus;
};

function buildTerminalMessages({
  errorMessage,
  run,
  status,
}: {
  errorMessage: string | null;
  run: StreamingRun;
  status: StreamRunTerminalStatus;
}): ChatMessageItem[] {
  const assistantMessage: ChatMessageItem = {
    content: run.content,
    error_message: errorMessage,
    id: run.assistantMessageId,
    reply_to_message_id: run.retryOfMessageId ?? run.userMessageId ?? null,
    role: MessageRole.ASSISTANT,
    sources_json: run.sources as ChatMessageItem["sources_json"],
    status,
  };

  if (run.userMessageId === null || run.retryOfMessageId != null) {
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
}

function patchRetriedUserMessage({
  queryClient,
  sessionId,
  userMessageId,
}: {
  queryClient: QueryClient;
  sessionId: number;
  userMessageId: number;
}) {
  queryClient.setQueryData(queryKeys.chat.messagesWindow(sessionId), (current: any) => {
    if (!current || typeof current !== "object" || !("pages" in current)) {
      return current;
    }

    let patched = false;
    const nextPages = current.pages.map((page: ChatMessageItem[]) =>
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
  });
}

export async function finalizeTerminalStreamRun({
  currentRun,
  currentSessionId,
  errorMessage,
  patchSessionContext,
  queryClient,
  sessionId,
  status,
}: FinalizeTerminalStreamRunInput) {
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
        queryClient,
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

  if (!patched) {
    await queryClient.invalidateQueries({
      queryKey: queryKeys.chat.messagesWindow(sessionId),
    });
  }

  return {
    patched,
    runId: currentRun?.runId ?? null,
    shouldPruneRun:
      currentRun != null && (status === MessageStatus.FAILED || currentSessionId === sessionId),
  };
}
