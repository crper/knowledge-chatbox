import { useCallback } from "react";
import { useQueryClient } from "@tanstack/react-query";

import { queryKeys } from "@/lib/api/query-keys";
import type {
  ChatAttachmentItem as PersistedChatAttachmentItem,
  ChatMessageItem,
  ChatSessionContextItem,
} from "../api/chat";
import { deleteChatMessage } from "../api/chat";
import { useChatComposerSubmit } from "./use-chat-composer-submit";
import { useChatStreamLifecycle } from "./use-chat-stream-lifecycle";
import { useChatStreamRun } from "./use-chat-stream-run";
import { findStreamRunByAssistantMessageId } from "../utils/stream-run-query";
import { useChatUiStore } from "../store/chat-ui-store";

type UseChatWorkspaceActionsParams = {
  beginSessionSubmit: (sessionId: number) => boolean;
  currentSessionIdRef: React.RefObject<number | null>;
  finishSessionSubmit: (sessionId: number) => void;
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
};

export function useChatWorkspaceActions({
  beginSessionSubmit,
  currentSessionIdRef,
  finishSessionSubmit,
  messages,
  patchSessionContext,
  patchUserMessageAttachments,
  requestScrollToLatest,
  resolvedActiveSessionId,
}: UseChatWorkspaceActionsParams) {
  const queryClient = useQueryClient();
  const setDraft = useChatUiStore((state) => state.setDraft);
  const streamRun = useChatStreamRun();
  const { sendMutation } = useChatStreamLifecycle({
    currentSessionIdRef,
    patchSessionContext,
    streamRun,
  });

  const { retryMessage, submitMessage } = useChatComposerSubmit({
    beginSessionSubmit,
    finishSessionSubmit,
    findRunByAssistantMessageId: (assistantMessageId) =>
      findStreamRunByAssistantMessageId(queryClient, assistantMessageId, resolvedActiveSessionId),
    messages,
    patchSessionContext,
    patchUserMessageAttachments,
    requestScrollToLatest,
    resolvedActiveSessionId,
    sendStreamMessage: sendMutation.mutateAsync,
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
        await queryClient.invalidateQueries({
          queryKey: queryKeys.chat.messagesWindow(resolvedActiveSessionId),
        });
        await queryClient.invalidateQueries({
          queryKey: queryKeys.chat.context(resolvedActiveSessionId),
        });
      }
    },
    [queryClient, resolvedActiveSessionId],
  );

  return {
    deleteFailedMessage,
    editFailedMessage,
    retryMessage,
    submitMessage,
  };
}
