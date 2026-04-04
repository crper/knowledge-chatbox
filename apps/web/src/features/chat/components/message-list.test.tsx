import { render, screen, waitFor, within } from "@testing-library/react";
import { fireEvent } from "@testing-library/react";

import { mockDesktopViewport, mockMobileViewport } from "@/test/viewport";
import { MessageList } from "./message-list";

function buildImageAttachment(name: string) {
  return {
    attachment_id: `${name}-id`,
    type: "image" as const,
    name,
    mime_type: "image/png",
    size_bytes: 1,
  };
}

describe("MessageList", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    mockDesktopViewport();
  });

  it("keeps successful message attachments expanded by default", () => {
    const imageAttachments = [
      buildImageAttachment("f2280f620f9045129491d54f4de3997d.png"),
      buildImageAttachment("a21109ebeb2d438f90a49af9e56ce922.png"),
      buildImageAttachment("third.png"),
      buildImageAttachment("fourth.png"),
      buildImageAttachment("fifth.png"),
      {
        attachment_id: "document-id",
        type: "document" as const,
        name: "夜航记录.pdf",
        mime_type: "application/pdf",
        size_bytes: 1,
      },
    ].map((attachment, index) =>
      attachment.type === "image"
        ? {
            ...attachment,
            resource_document_version_id: index + 11,
          }
        : attachment,
    );

    render(
      <MessageList
        messages={[
          {
            id: 1,
            role: "user",
            content: "看看这些图",
            status: "succeeded",
            attachments_json: imageAttachments,
            sources_json: [],
          },
        ]}
        onRetry={vi.fn()}
      />,
    );

    expect(screen.getByText("附件 6")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "收起附件" })).toBeInTheDocument();

    expect(screen.getByText("会话图片附件 1")).toBeInTheDocument();
    expect(screen.getByText("会话图片附件 2")).toBeInTheDocument();
    expect(screen.getByText("third.png")).toBeInTheDocument();
    expect(screen.getByText("夜航记录.pdf")).toBeInTheDocument();
    expect(screen.queryByText("+2")).not.toBeInTheDocument();
    expect(screen.queryByRole("img")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "预览附件 夜航记录.pdf" })).not.toBeInTheDocument();
  });

  it("opens an image viewer when a message preview is clicked", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        blob: () => Promise.resolve(new Blob(["image"], { type: "image/png" })),
      }),
    );

    const imageAttachments = [
      buildImageAttachment("f2280f620f9045129491d54f4de3997d.png"),
      buildImageAttachment("a21109ebeb2d438f90a49af9e56ce922.png"),
    ].map((attachment, index) => ({
      ...attachment,
      resource_document_version_id: index + 11,
    }));

    render(
      <MessageList
        messages={[
          {
            id: 1,
            role: "user",
            content: "看看这些图",
            status: "succeeded",
            attachments_json: imageAttachments,
            sources_json: [],
          },
        ]}
        onRetry={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "预览附件 会话图片附件 1" }));

    expect(await screen.findByRole("heading", { name: "会话图片附件 1" })).toBeInTheDocument();
  });

  it("prefers document_name over section_title and chunk_id in source titles", () => {
    render(
      <MessageList
        messages={[
          {
            id: 2,
            role: "assistant",
            content: "参考如下",
            status: "succeeded",
            attachments_json: [],
            sources_json: [
              {
                chunk_id: "chunk-1",
                document_name: "产品手册.pdf",
                section_title: "安装指南",
                page_number: 3,
                snippet: "示例片段",
              },
            ],
          },
        ]}
        onRetry={vi.fn()}
      />,
    );

    expect(screen.getByRole("button", { name: "查看引用 1" })).toBeInTheDocument();
    expect(screen.queryByText("安装指南")).not.toBeInTheDocument();
    expect(screen.queryByText("chunk-1")).not.toBeInTheDocument();
  });

  it("uses staggered desktop message lanes and differentiates role labels", () => {
    render(
      <MessageList
        messages={[
          {
            id: 1,
            role: "assistant",
            content: "先给你结论",
            status: "succeeded",
            attachments_json: [],
            sources_json: [],
          },
          {
            id: 2,
            role: "user",
            content: "我想看更清楚一点",
            status: "succeeded",
            attachments_json: [],
            sources_json: [],
          },
        ]}
        onRetry={vi.fn()}
      />,
    );

    const assistantLane = screen.getByTestId("chat-message-row-1");
    const userLane = screen.getByTestId("chat-message-row-2");
    const assistantLabel = screen.getByText("助手");
    const userLabel = screen.getByText("用户");

    expect(assistantLane).toHaveAttribute("data-message-layout", "staggered");
    expect(assistantLane).toHaveAttribute("data-message-side", "start");
    expect(userLane).toHaveAttribute("data-message-layout", "staggered");
    expect(userLane).toHaveAttribute("data-message-side", "end");
    expect(userLane).toHaveAttribute("data-message-width", "adaptive");
    expect(userLane).toHaveAttribute("data-message-text-align", "end");
    expect(assistantLabel).toHaveAttribute("data-message-label-style", "badge");
    expect(userLabel).toHaveAttribute("data-message-label-style", "tag");
  });

  it("falls back to a stacked message lane on mobile", () => {
    mockMobileViewport();

    render(
      <MessageList
        messages={[
          {
            id: 3,
            role: "assistant",
            content: "移动端先别太花",
            status: "succeeded",
            attachments_json: [],
            sources_json: [],
          },
          {
            id: 4,
            role: "user",
            content: "保持清楚就行",
            status: "succeeded",
            attachments_json: [],
            sources_json: [],
          },
        ]}
        onRetry={vi.fn()}
      />,
    );

    expect(screen.getByTestId("chat-message-row-3")).toHaveAttribute(
      "data-message-layout",
      "stacked",
    );
    expect(screen.getByTestId("chat-message-row-4")).toHaveAttribute(
      "data-message-layout",
      "stacked",
    );
  });

  it("marks assistant rich content bubbles as width-managed to prevent horizontal overflow", async () => {
    render(
      <MessageList
        messages={[
          {
            id: 6,
            role: "assistant",
            content: "![流程图](https://example.com/wide-diagram.png)",
            status: "succeeded",
            attachments_json: [],
            sources_json: [],
          },
        ]}
        onRetry={vi.fn()}
      />,
    );

    const bubble = screen.getByTestId("chat-message-bubble-6");
    const markdownBody = screen.getByTestId("chat-markdown-body");

    expect(bubble).toHaveAttribute("data-message-bubble-width", "adaptive");
    expect(markdownBody).toHaveAttribute("data-message-overflow", "managed");
    await waitFor(
      () => {
        expect(bubble.querySelector('[data-streamdown="image-wrapper"]')).not.toBeNull();
      },
      { timeout: 4000 },
    );
  });

  it("renders a dedicated recovery strip for failed user messages and prioritizes retry", () => {
    render(
      <MessageList
        messages={[
          {
            id: 5,
            role: "user",
            content: "这张图怎么解析",
            status: "failed",
            error_message: "image: unknown format (500)",
            attachments_json: [buildImageAttachment("failed.png")],
            sources_json: [],
          },
        ]}
        onDeleteFailed={vi.fn()}
        onEditFailed={vi.fn()}
        onRetry={vi.fn()}
      />,
    );

    const recovery = screen.getByTestId("chat-message-recovery-5");

    expect(screen.getByText("发送失败")).toBeInTheDocument();
    expect(recovery).toHaveTextContent(
      "图片暂时无法处理。请确认图片可正常打开，并切换到支持图片理解的模型后重试。",
    );
    expect(recovery).not.toHaveTextContent("image: unknown format (500)");
    expect(screen.getByRole("button", { name: "收起附件" })).toBeInTheDocument();
    expect(screen.getByText("failed.png")).toBeInTheDocument();
    expect(
      within(recovery)
        .getAllByRole("button")
        .map((button) => button.textContent?.trim()),
    ).toEqual(["重试", "编辑", "删除"]);
  });
});
