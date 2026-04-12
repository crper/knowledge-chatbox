import { useChatComposerStore } from "../store/chat-composer-store";
import { clearLastVisitedChatSessionId } from "./chat-session-recovery";

type ResetChatSessionStateOptions = {
  preserveChatRecovery?: boolean;
};

export function resetChatSessionState(options: ResetChatSessionStateOptions = {}) {
  if (options.preserveChatRecovery) {
    return;
  }

  const composerState = useChatComposerStore.getState();
  useChatComposerStore.persist.clearStorage();
  useChatComposerStore.setState({
    attachmentsBySession: {},
    draftsBySession: {},
    sendShortcut: composerState.sendShortcut,
  });
  clearLastVisitedChatSessionId();
}
