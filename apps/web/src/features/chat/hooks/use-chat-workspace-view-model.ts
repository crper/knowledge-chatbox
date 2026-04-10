import { useMemo } from "react";

import { useChatAttachmentStore } from "../store/chat-attachment-store";
import { useChatUiStore } from "../store/chat-ui-store";
import type { StreamingRun } from "../utils/streaming-run";
import { useChatSessionData } from "./use-chat-session-data";

type UseChatWorkspaceViewModelParams = {
  activeSessionId: number | null;
  isSessionSubmitPending: (sessionId: number | null) => boolean;
  sessionRunsById: Record<number, StreamingRun>;
};

export function useChatWorkspaceViewModel({
  activeSessionId,
  isSessionSubmitPending,
  sessionRunsById,
}: UseChatWorkspaceViewModelParams) {
  const attachmentsBySession = useChatAttachmentStore((state) => state.attachmentsBySession);
  const removeAttachment = useChatAttachmentStore((state) => state.removeAttachment);
  const draftsBySession = useChatUiStore((state) => state.draftsBySession);
  const sendShortcut = useChatUiStore((state) => state.sendShortcut);
  const setSendShortcut = useChatUiStore((state) => state.setSendShortcut);
  const setDraft = useChatUiStore((state) => state.setDraft);

  const sessionData = useChatSessionData({ activeSessionId, sessionRunsById });

  const attachments = useMemo(
    () =>
      sessionData.resolvedActiveSessionId === null
        ? []
        : (attachmentsBySession[String(sessionData.resolvedActiveSessionId)] ?? []),
    [attachmentsBySession, sessionData.resolvedActiveSessionId],
  );

  const draft = useMemo(
    () =>
      sessionData.resolvedActiveSessionId === null
        ? ""
        : (draftsBySession[String(sessionData.resolvedActiveSessionId)] ?? ""),
    [draftsBySession, sessionData.resolvedActiveSessionId],
  );

  const submitPending = isSessionSubmitPending(sessionData.resolvedActiveSessionId);

  return {
    ...sessionData,
    activeSessionId: sessionData.resolvedActiveSessionId,
    attachments,
    draft,
    hasMessages: sessionData.displayMessages.length > 0,
    removeAttachment,
    sendShortcut,
    sessionsReady: !sessionData.sessionsQuery.isPending && sessionData.messagesWindowReady,
    setDraft,
    setSendShortcut,
    submitPending,
  };
}
