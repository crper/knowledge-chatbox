import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";

import { AppProviders } from "@/providers/app-providers";
import { ChatPage } from "./chat-page";

let chatProfileData: { model: string; provider: "anthropic" | "ollama" | "openai" } | undefined;

vi.mock("@/features/chat/api/chat-query", () => ({
  chatProfileQueryOptions: () => ({
    queryKey: ["chat", "profile"],
    queryFn: async () => chatProfileData,
  }),
}));

vi.mock("@/features/chat/hooks/use-chat-workspace", () => ({
  useChatWorkspace: () => ({
    activeSession: { id: 1, title: "Session A", reasoning_mode: "on" },
    activeSessionId: 1,
    attachments: [],
    attachFiles: vi.fn(),
    deleteFailedMessage: vi.fn(),
    displayMessages: [],
    draft: "请帮我总结一下",
    editFailedMessage: vi.fn(),
    hasMessages: false,
    removeAttachment: vi.fn(),
    rejectFiles: vi.fn(),
    retryMessage: vi.fn(),
    sendShortcut: "enter",
    sessions: [{ id: 1, title: "Session A", reasoning_mode: "on" }],
    setDraft: vi.fn(),
    submitMessage: vi.fn(),
    submitPending: false,
  }),
}));

vi.mock("@/features/chat/components/message-input", () => ({
  MessageInput: ({
    activeModelLabel,
    onSubmit,
    reasoningMode,
  }: {
    activeModelLabel?: string | null;
    onSubmit?: () => void;
    reasoningMode?: string;
  }) => (
    <div>
      <div data-testid="message-input-active-model">{activeModelLabel}</div>
      <div data-testid="message-input-reasoning-mode">{reasoningMode}</div>
      <button onClick={onSubmit} type="button">
        submit
      </button>
    </div>
  ),
}));

describe("ChatPage model indicator", () => {
  function renderChatPage(initialEntry = "/chat/1") {
    return render(
      <MemoryRouter initialEntries={[initialEntry]}>
        <Routes>
          <Route
            element={
              <AppProviders>
                <ChatPage />
              </AppProviders>
            }
            path="/chat/:sessionId"
          />
        </Routes>
      </MemoryRouter>,
    );
  }

  beforeEach(() => {
    chatProfileData = undefined;
  });

  it("renders the composer when the chat profile query resolves", async () => {
    chatProfileData = {
      provider: "openai",
      model: "gpt-5.4",
    };

    renderChatPage();

    expect(await screen.findByTestId("message-input-active-model")).toBeInTheDocument();
    expect(await screen.findByTestId("message-input-reasoning-mode")).toHaveTextContent("on");
    expect(screen.getByRole("heading", { name: "开始您今天的第一个问题？" })).toBeInTheDocument();
  });

  it("keeps the composer interactive when the profile points to ollama", async () => {
    chatProfileData = {
      provider: "ollama",
      model: "qwen3.5:4b",
    };

    renderChatPage();

    fireEvent.click(screen.getByRole("button", { name: "submit" }));

    expect(await screen.findByTestId("message-input-active-model")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "submit" })).toBeInTheDocument();
  });
});
