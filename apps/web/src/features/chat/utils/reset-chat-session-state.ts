import { useChatUiStore } from "../store/chat-ui-store";
import { clearLastVisitedChatSessionId } from "./chat-session-recovery";

type ResetChatSessionStateOptions = {
  preserveChatRecovery?: boolean;
};

export function resetChatSessionState(options: ResetChatSessionStateOptions = {}) {
  if (options.preserveChatRecovery) {
    return;
  }

  const sendShortcut = useChatUiStore.getState().sendShortcut;
  useChatUiStore.persist.clearStorage();
  useChatUiStore.setState({
    attachmentsBySession: {},
    draftsBySession: {},
    sendShortcut,
  });
  clearLastVisitedChatSessionId();
}
