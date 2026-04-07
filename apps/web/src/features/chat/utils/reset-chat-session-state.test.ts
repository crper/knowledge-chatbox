import { useChatUiStore } from "../store/chat-ui-store";
import {
  LAST_VISITED_CHAT_SESSION_STORAGE_KEY,
  readLastVisitedChatSessionId,
} from "./chat-session-recovery";
import { resetChatSessionState } from "./reset-chat-session-state";

describe("resetChatSessionState", () => {
  beforeEach(() => {
    useChatUiStore.setState({
      attachmentsBySession: {
        "7": [
          {
            id: "attachment-1",
            kind: "document",
            name: "stale.txt",
            status: "queued",
          },
        ],
      },
      draftsBySession: { "7": "stale draft" },
      sendShortcut: "shift-enter",
    });
    window.localStorage.setItem(LAST_VISITED_CHAT_SESSION_STORAGE_KEY, "7");
  });

  it("clears chat ui state and recovery by default while preserving the send shortcut", () => {
    resetChatSessionState();

    expect(useChatUiStore.getState()).toMatchObject({
      attachmentsBySession: {},
      draftsBySession: {},
      sendShortcut: "shift-enter",
    });
    expect(readLastVisitedChatSessionId()).toBeNull();
  });

  it("preserves chat recovery state when explicitly requested", () => {
    resetChatSessionState({ preserveChatRecovery: true });

    expect(useChatUiStore.getState()).toMatchObject({
      attachmentsBySession: {
        "7": [
          {
            id: "attachment-1",
            kind: "document",
            name: "stale.txt",
            status: "queued",
          },
        ],
      },
      draftsBySession: { "7": "stale draft" },
      sendShortcut: "shift-enter",
    });
    expect(readLastVisitedChatSessionId()).toBe(7);
  });
});
