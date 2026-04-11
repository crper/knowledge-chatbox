import { useMemo } from "react";

import { useChatComposerStore } from "../store/chat-composer-store";
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
  const attachmentsBySession = useChatComposerStore((state) => state.attachmentsBySession);
  const removeAttachment = useChatComposerStore((state) => state.removeAttachment);
  const draftsBySession = useChatComposerStore((state) => state.draftsBySession);
  const sendShortcut = useChatComposerStore((state) => state.sendShortcut);
  const setSendShortcut = useChatComposerStore((state) => state.setSendShortcut);
  const setDraft = useChatComposerStore((state) => state.setDraft);

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
