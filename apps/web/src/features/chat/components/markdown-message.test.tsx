import * as React from "react";
import { render, screen, waitFor } from "@testing-library/react";

let streamdownShouldThrow = false;

vi.mock("streamdown", async () => {
  const actual = await vi.importActual<typeof import("streamdown")>("streamdown");

  return {
    ...actual,
    Streamdown: (props: React.ComponentProps<typeof actual.Streamdown>) => {
      if (streamdownShouldThrow) {
        throw new Error("streamdown render failed");
      }

      return React.createElement(actual.Streamdown, props);
    },
  };
});

import * as richRendererLoader from "./rich-markdown-renderer-loader";
import { MarkdownMessage } from "./markdown-message";

describe("MarkdownMessage", () => {
  afterEach(() => {
    streamdownShouldThrow = false;
    vi.restoreAllMocks();
  });

  it("renders inline math when content uses single dollar delimiters", async () => {
    const { container } = render(
      <MarkdownMessage content={"设 $E=mc^2$，并继续说明。"} isStreaming={false} />,
    );

    await waitFor(
      () => {
        expect(container.querySelector(".katex")).not.toBeNull();
      },
      { timeout: 4000 },
    );
    expect(container).not.toHaveTextContent("$E=mc^2$");
  });

  it("keeps currency-like dollar amounts as plain text", () => {
    const { container } = render(
      <MarkdownMessage content={"月费 $30/人，月收入 $4,500。"} isStreaming={false} />,
    );

    expect(container.querySelector(".katex")).toBeNull();
    expect(container).toHaveTextContent("$30/人");
    expect(container).toHaveTextContent("$4,500。");
  });

  it("renders CJK emphasis, tables, and code block controls", async () => {
    const { container } = render(
      <MarkdownMessage
        content={[
          "## 标题",
          "",
          "**中文文本（带括号）。**这句子继续也没问题。",
          "",
          "| 列1 | 列2 |",
          "| --- | --- |",
          "| 值1 | 值2 |",
          "",
          "```ts",
          "const answer = 42;",
          "```",
        ].join("\n")}
        isStreaming={false}
      />,
    );

    await waitFor(() => {
      expect(screen.getByRole("heading", { level: 2, name: "标题" })).toBeInTheDocument();
    });

    const emphasis = container.querySelector("strong, [data-streamdown='strong']");
    expect(emphasis).not.toBeNull();
    expect(emphasis).toHaveTextContent("中文文本（带括号）。");
    expect(screen.getByText("值1")).toBeInTheDocument();
    expect(container.querySelector('[data-streamdown="table-wrapper"]')).not.toBeNull();
    expect(container.querySelector('[data-streamdown="code-block-copy-button"]')).not.toBeNull();
    expect(
      container.querySelector('[data-streamdown="code-block-download-button"]'),
    ).not.toBeNull();
  });

  it("disables code block actions while content is streaming", async () => {
    const { container } = render(
      <MarkdownMessage
        content={["```ts", "const answer = 42;", "```"].join("\n")}
        isStreaming={true}
      />,
    );

    await waitFor(() => {
      expect(container.querySelector('[data-streamdown="code-block-copy-button"]')).not.toBeNull();
    });

    const copyButton = container.querySelector<HTMLButtonElement>(
      '[data-streamdown="code-block-copy-button"]',
    );
    const downloadButton = container.querySelector<HTMLButtonElement>(
      '[data-streamdown="code-block-download-button"]',
    );

    expect(copyButton).not.toBeNull();
    expect(downloadButton).not.toBeNull();
    expect(copyButton).toBeDisabled();
    expect(downloadButton).toBeDisabled();
  });

  it("keeps streamed content without rendering an extra loading row", () => {
    const { container } = render(<MarkdownMessage content="streamed answer" isStreaming={true} />);

    expect(container.querySelector('[data-message-body="assistant"]')).toHaveAttribute(
      "aria-busy",
      "true",
    );
    expect(container.querySelector('[data-message-body="assistant"]')).toHaveTextContent(
      "streamed answer",
    );
    expect(screen.queryByRole("status", { name: "正在生成回答" })).not.toBeInTheDocument();
  });

  it("shows a custom soft loading state before the first token arrives", () => {
    const { container } = render(<MarkdownMessage content="正在生成回答..." isStreaming={true} />);

    expect(screen.getByRole("status", { name: "正在生成回答" })).toBeInTheDocument();
    expect(container.querySelector('[data-assistant-loading-state="true"]')).not.toBeNull();
    expect(container.querySelector('[data-message-body="assistant"]')).toHaveAttribute(
      "aria-busy",
      "true",
    );
    expect(container.querySelector('[data-message-body="assistant"]')).not.toHaveTextContent(
      "正在生成回答...",
    );
  });

  it("falls back to plain text when markdown renderer crashes", () => {
    streamdownShouldThrow = true;
    const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    const { container } = render(
      <MarkdownMessage
        content={["```ts", "const answer = 42;", "```"].join("\n")}
        isStreaming={false}
      />,
    );

    expect(container.querySelector('[data-markdown-fallback="true"]')).not.toBeNull();
    expect(container).toHaveTextContent("const answer = 42;");
    expect(
      container.querySelector('[data-streamdown="code-block-copy-button"]'),
    ).not.toBeInTheDocument();

    consoleErrorSpy.mockRestore();
  });

  it("keeps plain text on the lightweight path without loading the rich renderer", () => {
    const loadSpy = vi.spyOn(richRendererLoader, "loadRichMarkdownRenderer");

    render(<MarkdownMessage content="just a plain answer" isStreaming={false} />);

    expect(screen.getByText("just a plain answer")).toBeInTheDocument();
    expect(loadSpy).not.toHaveBeenCalled();
  });

  it("shows plain text first while the rich renderer chunk is still loading", async () => {
    const originalLoad = richRendererLoader.loadRichMarkdownRenderer;
    const loadControl: { releaseLoad: (() => void) | null } = { releaseLoad: null };
    const pendingLoad = new Promise<Awaited<ReturnType<typeof originalLoad>>>((resolve) => {
      loadControl.releaseLoad = () => {
        void originalLoad().then(resolve);
      };
    });
    vi.spyOn(richRendererLoader, "loadRichMarkdownRenderer").mockReturnValue(pendingLoad);

    render(<MarkdownMessage content="# 标题" isStreaming={false} />);

    expect(screen.getByText("# 标题")).toBeInTheDocument();
    expect(screen.queryByRole("heading", { level: 1, name: "标题" })).not.toBeInTheDocument();

    const release = loadControl.releaseLoad;
    expect(typeof release).toBe("function");
    if (!release) {
      throw new Error("expected the rich renderer loader to remain pending");
    }
    release();

    await waitFor(() => {
      expect(screen.getByRole("heading", { level: 1, name: "标题" })).toBeInTheDocument();
    });
  });

  it("falls back to plain text when the rich renderer chunk fails to load", async () => {
    vi.spyOn(richRendererLoader, "loadRichMarkdownRenderer").mockRejectedValue(
      new Error("chunk failed"),
    );
    const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    render(<MarkdownMessage content="# 标题" isStreaming={false} />);

    await waitFor(() => {
      expect(screen.getByText("# 标题")).toBeInTheDocument();
    });
    expect(screen.queryByRole("heading", { level: 1, name: "标题" })).not.toBeInTheDocument();

    consoleErrorSpy.mockRestore();
  });
});
