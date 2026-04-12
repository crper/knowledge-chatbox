import type { ChatMessageItem, ChatSessionContextItem, ChatSourceItem } from "../api/chat";
import { joinStreamingRunContent, type StreamingRun } from "./streaming-run";
import { MessageRole, MessageStatus } from "../constants";

type StreamRunTerminalStatus = "failed" | "succeeded";
type StreamRunFinalizeReason = "failed" | "stopped" | "succeeded";

type FinalizeTerminalStreamRunInput = {
  currentRun: StreamingRun | null;
  currentSessionId: number | null;
  errorMessage: string | null;
  invalidateMessagesWindow: (sessionId: number) => Promise<void>;
  patchAssistantMessage: (input: {
    appendIfMissing?: ChatMessageItem[];
    assistantMessageId: number;
    patch: {
      content?: string;
      error_message?: string | null;
      sources_json?: ChatSourceItem[] | null;
      status?: MessageStatus;
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
  reason?: StreamRunFinalizeReason;
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
  const runContent = joinStreamingRunContent(run.content);
  const assistantMessage: ChatMessageItem = {
    content: runContent,
    error_message: errorMessage,
    id: run.assistantMessageId,
    reply_to_message_id: run.retryOfMessageId ?? run.userMessageId ?? null,
    role: MessageRole.ASSISTANT,
    sources_json: run.sources,
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

export async function finalizeTerminalStreamRun({
  currentRun,
  currentSessionId,
  errorMessage,
  invalidateMessagesWindow,
  patchAssistantMessage,
  patchRetriedUserMessage,
  patchSessionContext,
  reason,
  sessionId,
  status,
}: FinalizeTerminalStreamRunInput) {
  const finalizeReason = reason ?? status;
  const patched =
    currentRun == null
      ? false
      : patchAssistantMessage({
          appendIfMissing: buildTerminalMessages({
            errorMessage,
            run: currentRun,
            status,
          }),
          assistantMessageId: currentRun.assistantMessageId,
          patch: {
            content: joinStreamingRunContent(currentRun.content),
            error_message: errorMessage,
            sources_json: currentRun.sources,
            status,
          },
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
      latestAssistantSources: currentRun.sources,
      sessionId,
    });
  }

  if (!patched && finalizeReason !== "stopped") {
    await invalidateMessagesWindow(sessionId);
  }

  return {
    patched,
    runId: currentRun?.runId ?? null,
    shouldPruneRun:
      currentRun != null &&
      finalizeReason !== "stopped" &&
      (status === MessageStatus.FAILED || currentSessionId === sessionId),
  };
}
