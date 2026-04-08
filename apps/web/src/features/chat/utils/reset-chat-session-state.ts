import { resetChatAttachmentStore } from "../store/chat-attachment-store";
import { useChatUiStore } from "../store/chat-ui-store";
import { clearLastVisitedChatSessionId } from "./chat-session-recovery";

type ResetChatSessionStateOptions = {
  preserveChatRecovery?: boolean;
};

export function resetChatSessionState(options: ResetChatSessionStateOptions = {}) {
  if (options.preserveChatRecovery) {
    return;
  }

  const chatUiState = useChatUiStore.getState();
  useChatUiStore.persist.clearStorage();
  useChatUiStore.setState({
    draftsBySession: {},
    sendShortcut: chatUiState.sendShortcut,
  });
  resetChatAttachmentStore();
  clearLastVisitedChatSessionId();
}
