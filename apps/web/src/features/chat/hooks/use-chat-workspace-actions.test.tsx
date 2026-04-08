import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClientProvider } from "@tanstack/react-query";

import { createTestQueryClient } from "@/test/query-client";
import { useChatAttachmentStore } from "../store/chat-attachment-store";
import { useChatUiStore } from "../store/chat-ui-store";
import { useChatWorkspaceActions } from "./use-chat-workspace-actions";

const submitMessageSpy = vi.fn(async () => {});
const retryMessageSpy = vi.fn(async () => {});
const sendStreamMessageSpy = vi.fn(async () => ({ userMessageId: 1 }));
const findRunByAssistantMessageIdSpy = vi.fn();
const invalidateSessionArtifactsSpy = vi.fn(async () => {});
const useChatComposerSubmitSpy = vi.fn((_args: unknown) => ({
  retryMessage: retryMessageSpy,
  submitMessage: submitMessageSpy,
}));

vi.mock("./use-chat-composer-submit", () => ({
  useChatComposerSubmit: (args: unknown) => useChatComposerSubmitSpy(args),
}));

vi.mock("../api/chat", async () => {
  const actual = await vi.importActual<typeof import("../api/chat")>("../api/chat");
  return {
    ...actual,
    deleteChatMessage: vi.fn(async () => {}),
  };
});

function ActionsHost() {
  const actions = useChatWorkspaceActions({
    beginSessionSubmit: vi.fn(() => true),
    finishSessionSubmit: vi.fn(),
    messages: [],
    patchSessionContext: vi.fn(),
    patchUserMessageAttachments: vi.fn(() => false),
    requestScrollToLatest: vi.fn(),
    resolvedActiveSessionId: 7,
    invalidateSessionArtifacts: invalidateSessionArtifactsSpy,
    findRunByAssistantMessageId: findRunByAssistantMessageIdSpy,
    sendStreamMessage: sendStreamMessageSpy,
  });

  return (
    <div>
      <button
        onClick={() =>
          actions.editFailedMessage({
            id: 3,
            role: "user",
            content: "repair me",
            status: "failed",
            sources_json: [],
          })
        }
        type="button"
      >
        edit
      </button>
      <button
        onClick={() =>
          void actions.deleteFailedMessage({
            id: 3,
            role: "user",
            content: "repair me",
            status: "failed",
            sources_json: [],
          })
        }
        type="button"
      >
        delete
      </button>
      <button onClick={() => void actions.submitMessage()} type="button">
        submit
      </button>
      <button
        onClick={() =>
          void actions.retryMessage({
            id: 4,
            role: "assistant",
            content: "failed reply",
            status: "failed",
            reply_to_message_id: 3,
            sources_json: [],
          })
        }
        type="button"
      >
        retry
      </button>
    </div>
  );
}

describe("useChatWorkspaceActions", () => {
  beforeEach(() => {
    submitMessageSpy.mockClear();
    retryMessageSpy.mockClear();
    sendStreamMessageSpy.mockClear();
    findRunByAssistantMessageIdSpy.mockClear();
    invalidateSessionArtifactsSpy.mockClear();
    useChatComposerSubmitSpy.mockClear();
    useChatAttachmentStore.setState({
      attachmentsBySession: {},
    });
    useChatUiStore.setState({
      draftsBySession: {},
      sendShortcut: "enter",
    });
  });

  it("writes failed user content back into the active draft", () => {
    const queryClient = createTestQueryClient();

    render(
      <QueryClientProvider client={queryClient}>
        <ActionsHost />
      </QueryClientProvider>,
    );

    fireEvent.click(screen.getByRole("button", { name: "edit" }));

    expect(useChatUiStore.getState().draftsBySession["7"]).toBe("repair me");
  });

  it("uses the injected invalidation dependency after deleting a failed message", async () => {
    const queryClient = createTestQueryClient();

    render(
      <QueryClientProvider client={queryClient}>
        <ActionsHost />
      </QueryClientProvider>,
    );

    fireEvent.click(screen.getByRole("button", { name: "delete" }));

    await waitFor(() => {
      expect(invalidateSessionArtifactsSpy).toHaveBeenCalledWith(7);
    });
  });

  it("passes submit and retry through to composer actions", async () => {
    const queryClient = createTestQueryClient();

    render(
      <QueryClientProvider client={queryClient}>
        <ActionsHost />
      </QueryClientProvider>,
    );

    fireEvent.click(screen.getByRole("button", { name: "submit" }));
    fireEvent.click(screen.getByRole("button", { name: "retry" }));

    await waitFor(() => {
      expect(submitMessageSpy).toHaveBeenCalled();
      expect(retryMessageSpy).toHaveBeenCalled();
    });
  });

  it("forwards the injected sendStreamMessage dependency into composer submit", () => {
    const queryClient = createTestQueryClient();

    render(
      <QueryClientProvider client={queryClient}>
        <ActionsHost />
      </QueryClientProvider>,
    );

    expect(useChatComposerSubmitSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        findRunByAssistantMessageId: findRunByAssistantMessageIdSpy,
        sendStreamMessage: sendStreamMessageSpy,
      }),
    );
  });
});
