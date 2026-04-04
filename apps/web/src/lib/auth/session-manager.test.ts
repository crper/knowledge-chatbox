import { queryKeys } from "@/lib/api/query-keys";
import { useChatStreamStore } from "@/features/chat/store/chat-stream-store";
import {
  LAST_VISITED_CHAT_SESSION_STORAGE_KEY,
  readLastVisitedChatSessionId,
} from "@/features/chat/utils/chat-session-recovery";
import { useSessionStore } from "@/lib/auth/session-store";
import { useChatUiStore } from "@/features/chat/store/chat-ui-store";
import { setAccessToken } from "@/lib/auth/token-store";
import { jsonResponse } from "@/test/http";
import { createTestQueryClient } from "@/test/query-client";
import { bootstrapSession } from "./session-manager";

function createQueryClient() {
  return createTestQueryClient({
    defaultOptions: {
      queries: {
        retry: false,
      },
    },
  });
}

function mockBootstrapResponse(responseData: unknown) {
  vi.stubGlobal(
    "fetch",
    vi.fn().mockImplementation((input: string) => {
      if (input.endsWith("/api/auth/bootstrap")) {
        return Promise.resolve(
          jsonResponse({
            success: true,
            data: responseData,
            error: null,
          }),
        );
      }

      return Promise.reject(new Error(`Unexpected request: ${input}`));
    }),
  );
}

function seedSessionScopedState(queryClient: ReturnType<typeof createQueryClient>) {
  queryClient.setQueryData(queryKeys.chat.sessions, [
    { id: 7, reasoning_mode: "default", title: "stale chat" },
  ]);
  queryClient.setQueryData(queryKeys.documents.list, [{ document_id: 99, name: "stale.txt" }]);
  useChatUiStore.setState({
    activeSessionId: 7,
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
  useChatStreamStore.setState({
    runsById: {
      11: {
        assistantMessageId: 12,
        content: "old delta",
        errorMessage: null,
        runId: 11,
        sessionId: 7,
        sources: [],
        status: "streaming",
        toastShown: false,
        userContent: "old question",
        userMessageId: 10,
      },
    },
  });
  window.localStorage.setItem(LAST_VISITED_CHAT_SESSION_STORAGE_KEY, "7");
}

describe("session-manager", () => {
  beforeEach(() => {
    setAccessToken(null);
    useSessionStore.getState().reset();
    useChatStreamStore.setState({ runsById: {} });
    vi.unstubAllGlobals();
  });

  it("marks the session anonymous when bootstrap endpoint reports no active session", async () => {
    mockBootstrapResponse({
      authenticated: false,
      access_token: null,
      expires_in: null,
      token_type: "Bearer",
      user: null,
    });
    const queryClient = createQueryClient();

    await expect(bootstrapSession(queryClient)).resolves.toBeNull();
    expect(useSessionStore.getState().status).toBe("anonymous");
  });

  it("preserves local chat recovery state when bootstrap restores a session", async () => {
    mockBootstrapResponse({
      authenticated: true,
      access_token: "restored-access-token",
      expires_in: 3600,
      token_type: "Bearer",
      user: {
        id: 42,
        username: "restored-admin",
        role: "admin",
        theme_preference: "dark",
      },
    });
    const queryClient = createQueryClient();
    seedSessionScopedState(queryClient);

    const restoredUser = await bootstrapSession(queryClient);

    expect(restoredUser).toMatchObject({
      id: 42,
      role: "admin",
      theme_preference: "dark",
      username: "restored-admin",
    });
    expect(queryClient.getQueryData(queryKeys.auth.me)).toMatchObject({
      id: 42,
      username: "restored-admin",
    });
    expect(queryClient.getQueryData(queryKeys.chat.sessions)).toBeUndefined();
    expect(queryClient.getQueryData(queryKeys.documents.list)).toBeUndefined();
    expect(useChatUiStore.getState()).toMatchObject({
      activeSessionId: 7,
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
    expect(useChatStreamStore.getState().runsById).toEqual({});
    expect(readLastVisitedChatSessionId()).toBe(7);
    expect(useSessionStore.getState().status).toBe("authenticated");
  });
});
