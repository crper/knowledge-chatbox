import { useCallback } from "react";

import type {
  ChatAttachmentItem as PersistedChatAttachmentItem,
  ChatMessageItem,
  ChatSessionContextItem,
} from "../api/chat";
import type { ChatStreamAttachmentInput } from "../api/chat-stream";
import { deleteChatMessage } from "../api/chat";
import { MessageStatus } from "../constants";
import { useChatComposerStore } from "../store/chat-composer-store";
import { useChatComposerSubmit } from "./use-chat-composer-submit";

type UseChatWorkspaceActionsParams = {
  beginSessionSubmit: (
    sessionId: number,
    controller: AbortController,
    clientRequestId?: string | null,
  ) => boolean;
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
  finishSessionSubmit: (sessionId: number) => void;
  invalidateSessionArtifacts: (sessionId: number) => Promise<void>;
  messages: ChatMessageItem[];
  patchSessionContext: (input: {
    attachments?: ChatSessionContextItem["attachments"];
    latestAssistantMessageId?: number;
    latestAssistantSources?: ChatSessionContextItem["latest_assistant_sources"];
    sessionId: number;
  }) => void;
  patchUserMessageAttachments: (input: {
    attachments: PersistedChatAttachmentItem[];
    sessionId: number;
    userMessageId: number;
  }) => boolean;
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
  beginSessionSubmit,
  findRunByAssistantMessageId,
  finishSessionSubmit,
  invalidateSessionArtifacts,
  messages,
  patchSessionContext,
  patchUserMessageAttachments,
  requestScrollToLatest,
  resolvedActiveSessionId,
  sendStreamMessage,
}: UseChatWorkspaceActionsParams) {
  const setDraft = useChatComposerStore((state) => state.setDraft);

  const { retryMessage, submitMessage } = useChatComposerSubmit({
    beginSessionSubmit,
    finishSessionSubmit,
    findRunByAssistantMessageId,
    messages,
    patchSessionContext,
    patchUserMessageAttachments,
    requestScrollToLatest,
    resolvedActiveSessionId,
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
        await invalidateSessionArtifacts(resolvedActiveSessionId);
      }
    },
    [invalidateSessionArtifacts, resolvedActiveSessionId],
  );

  return {
    deleteFailedMessage,
    editFailedMessage,
    retryMessage,
    submitMessage,
  };
}
