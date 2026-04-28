import type { ChatMessageItem } from "../api/chat";
import type { ChatCacheWriter } from "./chat-cache-writer";
import { joinStreamingRunContent, type StreamingRun } from "./streaming-run";
import { MessageRole, MessageStatus } from "../constants";

type StreamRunTerminalStatus = "failed" | "succeeded";
type StreamRunFinalizeReason = "failed" | "stopped" | "succeeded";

type FinalizeTerminalStreamRunInput = {
  cacheWriter: Pick<
    ChatCacheWriter,
    | "invalidateSessionArtifacts"
    | "patchAssistantMessage"
    | "patchRetriedUserMessage"
    | "patchSessionContext"
  >;
  currentRun: StreamingRun | null;
  currentSessionId: number | null;
  errorMessage: string | null;
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
    sources: run.sources,
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
      sources: [],
      status,
    },
    assistantMessage,
  ];
}

export async function finalizeTerminalStreamRun({
  cacheWriter,
  currentRun,
  currentSessionId,
  errorMessage,
  reason,
  sessionId,
  status,
}: FinalizeTerminalStreamRunInput) {
  const finalizeReason = reason ?? status;
  const patched =
    currentRun == null
      ? false
      : cacheWriter.patchAssistantMessage({
          appendIfMissing: buildTerminalMessages({
            errorMessage,
            run: currentRun,
            status,
          }),
          assistantMessageId: currentRun.assistantMessageId,
          patch: {
            content: joinStreamingRunContent(currentRun.content),
            error_message: errorMessage,
            sources: currentRun.sources,
            status,
          },
          sessionId,
        });

  if (currentRun != null) {
    if (status === MessageStatus.SUCCEEDED && currentRun.retryOfMessageId != null) {
      cacheWriter.patchRetriedUserMessage({
        sessionId,
        userMessageId: currentRun.retryOfMessageId,
      });
    }

    cacheWriter.patchSessionContext({
      latestAssistantMessageId: currentRun.assistantMessageId,
      latestAssistantSources: currentRun.sources,
      sessionId,
    });
  }

  if (!patched && finalizeReason !== "stopped") {
    await cacheWriter.invalidateSessionArtifacts(sessionId);
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
