import { fireEvent, render, screen } from "@testing-library/react";

import { MessageInput } from "./message-input";

describe("MessageInput", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.stubGlobal(
      "URL",
      Object.assign(URL, {
        createObjectURL: vi.fn(() => "blob:composer-preview"),
        revokeObjectURL: vi.fn(),
      }),
    );
  });

  it("renders composer controls without send-shortcut picker", () => {
    render(
      <MessageInput
        draft="hello"
        onChange={() => {}}
        onSubmit={() => {}}
        sendShortcut="shift-enter"
      />,
    );

    const body = screen.getByTestId("message-input-body");
    const actions = screen.getByTestId("message-input-actions");

    expect(screen.getByTestId("message-input-shell")).toBeInTheDocument();
    expect(screen.queryByTestId("message-input-attachments")).not.toBeInTheDocument();
    expect(body).toContainElement(screen.getByLabelText("消息输入"));
    expect(actions).toContainElement(screen.getByRole("button", { name: "附加资源" }));
    expect(actions).toContainElement(screen.getByRole("button", { name: "发送" }));
    expect(screen.queryByRole("combobox", { name: "发送快捷键" })).not.toBeInTheDocument();
  });

  it("shows the active provider and model in the action rail", () => {
    render(
      <MessageInput
        activeModelLabel="OpenAI / gpt-5.4"
        draft="hello"
        onChange={() => {}}
        onSubmit={() => {}}
        sendShortcut="shift-enter"
      />,
    );

    expect(screen.getByText("OpenAI / gpt-5.4")).toBeInTheDocument();
  });

  it("does not show a redundant language hint in the composer", () => {
    render(
      <MessageInput draft="" onChange={() => {}} onSubmit={() => {}} sendShortcut="shift-enter" />,
    );

    expect(
      screen.queryByText("支持中英双语提问，会尽量跟随你的语种回复。"),
    ).not.toBeInTheDocument();
  });

  it("shows a unified attachment panel in the composer and supports collapsing", () => {
    render(
      <MessageInput
        attachments={[
          {
            id: "attachment-1",
            file: new File(["hello"], "image.png", { type: "image/png" }),
            kind: "image",
            mimeType: "image/png",
            name: "image.png",
            status: "queued",
          },
        ]}
        draft=""
        onChange={() => {}}
        onRemoveAttachment={() => {}}
        onSubmit={() => {}}
        sendShortcut="shift-enter"
      />,
    );

    expect(screen.getByText("附件 1")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "收起附件" })).toBeInTheDocument();
    expect(screen.getByText("image.png")).toBeInTheDocument();
    expect(screen.getByText("待发送")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "移除附件 image.png" })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "收起附件" }));

    expect(screen.queryByText("image.png")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "展开附件" })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "展开附件" }));

    expect(screen.getByText("image.png")).toBeInTheDocument();
  });

  it("renders composer attachments as a unified list and only images are previewable", async () => {
    render(
      <MessageInput
        attachments={[
          {
            id: "attachment-image",
            file: new File(["hello"], "image.png", { type: "image/png" }),
            kind: "image",
            mimeType: "image/png",
            name: "image.png",
            status: "queued",
          },
          {
            id: "attachment-document",
            file: new File(["hello"], "guide.pdf", { type: "application/pdf" }),
            kind: "document",
            mimeType: "application/pdf",
            name: "guide.pdf",
            status: "queued",
          },
        ]}
        draft=""
        onChange={() => {}}
        onRemoveAttachment={() => {}}
        onSubmit={() => {}}
        sendShortcut="shift-enter"
      />,
    );

    expect(screen.getByText("附件 2")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "预览附件 image.png" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "预览附件 guide.pdf" })).not.toBeInTheDocument();
    expect(screen.getByText("guide.pdf")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "移除附件 image.png" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "移除附件 guide.pdf" })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "预览附件 image.png" }));

    expect(await screen.findByRole("heading", { name: "image.png" })).toBeInTheDocument();
  });

  it("shows an attachment scope hint when the current turn has attachments", () => {
    render(
      <MessageInput
        attachmentScopeHint="本次回答只会使用当前附件作为文档范围"
        draft=""
        onChange={() => {}}
        onSubmit={() => {}}
        sendShortcut="shift-enter"
      />,
    );

    expect(screen.getByText("本次回答只会使用当前附件作为文档范围")).toBeInTheDocument();
  });

  it("does not render an attachment scope hint when none is provided", () => {
    render(
      <MessageInput draft="" onChange={() => {}} onSubmit={() => {}} sendShortcut="shift-enter" />,
    );

    expect(screen.queryByText("本次回答只会使用当前附件作为文档范围")).not.toBeInTheDocument();
  });

  it("shows a spinner status while submitting", () => {
    const onStopSubmit = vi.fn();

    render(
      <MessageInput
        draft="hello"
        onChange={() => {}}
        onStopSubmit={onStopSubmit}
        onSubmit={() => {}}
        sendShortcut="shift-enter"
        submitPending={true}
      />,
    );

    const stopButton = screen.getByRole("button", { name: "停止生成" });

    expect(stopButton).toBeEnabled();
    expect(screen.getByText("正在生成，可随时停止")).toBeInTheDocument();
    expect(screen.getByRole("status", { name: "发送中" })).toBeInTheDocument();

    fireEvent.click(stopButton);

    expect(onStopSubmit).toHaveBeenCalledTimes(1);
  });

  it("submits with Enter by default", () => {
    const onSubmit = vi.fn();

    render(
      <MessageInput draft="hello" onChange={() => {}} onSubmit={onSubmit} sendShortcut="enter" />,
    );

    fireEvent.keyDown(screen.getByLabelText("消息输入"), {
      key: "Enter",
    });

    expect(onSubmit).toHaveBeenCalledTimes(1);
  });

  it("blurs the textarea when the action rail is pressed", () => {
    render(
      <MessageInput
        activeModelLabel="Ollama / qwen3.5:4b"
        draft="hello"
        onChange={() => {}}
        onSubmit={() => {}}
        reasoningModeVisible={true}
        sendShortcut="enter"
      />,
    );

    const input = screen.getByLabelText("消息输入");
    input.focus();
    expect(input).toHaveFocus();

    fireEvent.pointerDown(screen.getByTestId("message-input-actions"));

    expect(input).not.toHaveFocus();
  });

  it("renders the selected reasoning mode label in the composer rail", () => {
    render(
      <MessageInput
        draft="hello"
        onChange={() => {}}
        onSubmit={() => {}}
        reasoningMode="on"
        reasoningModeVisible={true}
        sendShortcut="enter"
      />,
    );

    expect(screen.getByRole("combobox", { name: "思考模式" })).toHaveTextContent("开启");
  });

  it("does not submit while the user is composing with IME", () => {
    const onSubmit = vi.fn();

    render(
      <MessageInput
        draft="家里的师傅"
        onChange={() => {}}
        onSubmit={onSubmit}
        sendShortcut="enter"
      />,
    );

    const input = screen.getByLabelText("消息输入");
    fireEvent.keyDown(input, {
      key: "Enter",
      isComposing: true,
    });

    expect(onSubmit).not.toHaveBeenCalled();

    fireEvent.keyDown(input, {
      key: "Enter",
    });

    expect(onSubmit).toHaveBeenCalledTimes(1);
  });
});
