import { useMemo } from "react";

import { useChatUiStore } from "../store/chat-ui-store";
import { useChatSessionData } from "./use-chat-session-data";

type UseChatWorkspaceViewModelParams = {
  activeSessionId: number | null;
  isSessionSubmitPending: (sessionId: number | null) => boolean;
};

export function useChatWorkspaceViewModel({
  activeSessionId,
  isSessionSubmitPending,
}: UseChatWorkspaceViewModelParams) {
  const attachmentsBySession = useChatUiStore((state) => state.attachmentsBySession);
  const draftsBySession = useChatUiStore((state) => state.draftsBySession);
  const removeAttachment = useChatUiStore((state) => state.removeAttachment);
  const sendShortcut = useChatUiStore((state) => state.sendShortcut);
  const setSendShortcut = useChatUiStore((state) => state.setSendShortcut);
  const setDraft = useChatUiStore((state) => state.setDraft);

  const sessionData = useChatSessionData(activeSessionId);

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
