import { render, screen } from "@testing-library/react";

import type { ChatMessageItem } from "../api/chat";
import { useChatComposerStore } from "../store/chat-composer-store";
import { useChatWorkspaceViewModel } from "./use-chat-workspace-view-model";

type MockSessionDataState = {
  activeSession: { id: number; title: string } | null;
  displayMessages: ChatMessageItem[];
  hasOlderMessages: boolean;
  isLoadingOlderMessages: boolean;
  loadOlderMessages: () => void;
  messages: ChatMessageItem[];
  messagesWindowReady: boolean;
  patchSessionContext: () => void;
  patchUserMessageAttachments: () => void;
  resolvedActiveSessionId: number | null;
  sessions: Array<{ id: number; title: string }>;
  sessionsQuery: { isPending: boolean };
};

const sessionDataState: MockSessionDataState = {
  activeSession: { id: 7, title: "Session 7" },
  displayMessages: [
    {
      id: 1,
      role: "assistant",
      content: "hello",
      status: "succeeded",
      sources: [],
    },
  ],
  hasOlderMessages: false,
  isLoadingOlderMessages: false,
  loadOlderMessages: vi.fn(),
  messages: [],
  messagesWindowReady: true,
  patchSessionContext: vi.fn(),
  patchUserMessageAttachments: vi.fn(),
  resolvedActiveSessionId: 7,
  sessions: [{ id: 7, title: "Session 7" }],
  sessionsQuery: { isPending: false },
};

vi.mock("./use-chat-session-data", () => ({
  useChatSessionData: () => sessionDataState,
}));

function ViewModelHost({
  activeSessionId,
  submitPending,
}: {
  activeSessionId: number | null;
  submitPending: boolean;
}) {
  const viewModel = useChatWorkspaceViewModel({
    activeSessionId,
    isSessionSubmitPending: () => submitPending,
    sessionRunsById: {},
  });

  return (
    <div>
      <div data-testid="draft">{viewModel.draft}</div>
      <div data-testid="attachments">{viewModel.attachments.length}</div>
      <div data-testid="has-messages">{String(viewModel.hasMessages)}</div>
      <div data-testid="sessions-ready">{String(viewModel.sessionsReady)}</div>
      <div data-testid="submit-pending">{String(viewModel.submitPending)}</div>
      <div data-testid="active-session-id">{String(viewModel.activeSessionId)}</div>
    </div>
  );
}

describe("useChatWorkspaceViewModel", () => {
  beforeEach(() => {
    sessionDataState.activeSession = { id: 7, title: "Session 7" };
    sessionDataState.displayMessages = [
      {
        id: 1,
        role: "assistant",
        content: "hello",
        status: "succeeded",
        sources: [],
      },
    ];
    sessionDataState.resolvedActiveSessionId = 7;
    useChatComposerStore.persist.clearStorage();
    useChatComposerStore.setState({
      attachmentsBySession: {
        "7": [
          {
            id: "a1",
            kind: "document",
            name: "notes.md",
            status: "queued",
          },
        ],
      },
      draftsBySession: {
        "7": "draft text",
      },
      sendShortcut: "enter",
    });
  });

  it("derives session-scoped draft, attachments, and submit state", () => {
    render(<ViewModelHost activeSessionId={7} submitPending />);

    expect(screen.getByTestId("draft")).toHaveTextContent("draft text");
    expect(screen.getByTestId("attachments")).toHaveTextContent("1");
    expect(screen.getByTestId("has-messages")).toHaveTextContent("true");
    expect(screen.getByTestId("sessions-ready")).toHaveTextContent("true");
    expect(screen.getByTestId("submit-pending")).toHaveTextContent("true");
    expect(screen.getByTestId("active-session-id")).toHaveTextContent("7");
  });

  it("falls back to empty draft and attachments without an active session", () => {
    sessionDataState.resolvedActiveSessionId = null;
    sessionDataState.activeSession = null;
    sessionDataState.displayMessages = [];

    render(<ViewModelHost activeSessionId={null} submitPending={false} />);

    expect(screen.getByTestId("draft")).toBeEmptyDOMElement();
    expect(screen.getByTestId("attachments")).toHaveTextContent("0");
    expect(screen.getByTestId("has-messages")).toHaveTextContent("false");
    expect(screen.getByTestId("submit-pending")).toHaveTextContent("false");
    expect(screen.getByTestId("active-session-id")).toHaveTextContent("null");
  });
});
