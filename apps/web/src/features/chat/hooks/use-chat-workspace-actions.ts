import { useCallback } from "react";

import type { ChatMessageItem } from "../api/chat";
import type { ChatStreamAttachmentInput } from "../api/chat-stream";
import type { ChatRuntime } from "../runtime/chat-runtime";
import type { ChatCacheWriter } from "../utils/chat-cache-writer";
import { deleteChatMessage } from "../api/chat";
import { MessageStatus } from "../constants";
import { useChatComposerStore } from "../store/chat-composer-store";
import { useChatComposerSubmit } from "./use-chat-composer-submit";

type UseChatWorkspaceActionsParams = {
  runtime: Pick<ChatRuntime, "beginSubmit" | "finishSubmit">;
  findRunByAssistantMessageId: (assistantMessageId: number) =>
    | {
        assistantMessageId: number;
        retryOfMessageId?: number | null;
        runId: number;
        sessionId: number;
        status: MessageStatus;
        toastShown: boolean;
        userContent: string;
        userMessageId: number | null;
      }
    | undefined;
  cacheWriter: Pick<
    ChatCacheWriter,
    "invalidateSessionArtifacts" | "patchSessionContext" | "patchUserMessageAttachments"
  >;
  messages: ChatMessageItem[];
  requestScrollToLatest: () => void;
  resolvedActiveSessionId: number | null;
  sendStreamMessage: (input: {
    attachments?: ChatStreamAttachmentInput[];
    clientRequestId: string;
    content: string;
    retryOfMessageId?: number;
    sessionId: number;
    signal?: AbortSignal;
  }) => Promise<{ userMessageId?: number | null }>;
};

export function useChatWorkspaceActions({
  cacheWriter,
  findRunByAssistantMessageId,
  messages,
  requestScrollToLatest,
  resolvedActiveSessionId,
  runtime,
  sendStreamMessage,
}: UseChatWorkspaceActionsParams) {
  const setDraft = useChatComposerStore((state) => state.setDraft);

  const { retryMessage, submitMessage } = useChatComposerSubmit({
    cacheWriter,
    findRunByAssistantMessageId,
    messages,
    requestScrollToLatest,
    resolvedActiveSessionId,
    runtime,
    sendStreamMessage,
  });

  const editFailedMessage = useCallback(
    (message: ChatMessageItem) => {
      if (resolvedActiveSessionId === null) {
        return;
      }
      setDraft(resolvedActiveSessionId, message.content);
    },
    [resolvedActiveSessionId, setDraft],
  );

  const deleteFailedMessage = useCallback(
    async (message: ChatMessageItem) => {
      await deleteChatMessage(message.id);
      if (resolvedActiveSessionId !== null) {
        await cacheWriter.invalidateSessionArtifacts(resolvedActiveSessionId);
      }
    },
    [cacheWriter, resolvedActiveSessionId],
  );

  return {
    deleteFailedMessage,
    editFailedMessage,
    retryMessage,
    submitMessage,
  };
}
