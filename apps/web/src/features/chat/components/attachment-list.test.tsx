import { fireEvent, render, screen } from "@testing-library/react";

import { AttachmentList, type AttachmentListItem } from "./attachment-list";

function buildItems(): AttachmentListItem[] {
  return [
    {
      id: "image-1",
      displayName: "会话图片附件 1",
      kind: "image",
      onPreview: vi.fn(),
      onRemove: vi.fn(),
      previewable: true,
      rawName: "e31c779fc7a14e68b23cf94c999b0a61.jpeg~tplv-a9rns2rl98-image_raw_b.png",
      statusLabel: "待发送",
    },
    {
      id: "doc-1",
      displayName: "guide.pdf",
      kind: "document",
      onRemove: vi.fn(),
      previewable: false,
      statusLabel: "已上传",
    },
  ];
}

describe("AttachmentList", () => {
  it("renders a unified attachment panel with header, preview, and remove actions", () => {
    const items = buildItems();

    render(<AttachmentList items={items} testId="attachment-list" />);

    expect(screen.getByText("附件 2")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "收起附件" })).toBeInTheDocument();
    expect(screen.getByTestId("attachment-list")).toBeInTheDocument();
    expect(screen.getByText("会话图片附件 1")).toBeInTheDocument();
    expect(screen.getByText("guide.pdf")).toBeInTheDocument();
    expect(screen.getByText("待发送")).toBeInTheDocument();
    expect(screen.getByText("已上传")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "预览附件 会话图片附件 1" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "移除附件 guide.pdf" })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "预览附件 会话图片附件 1" }));
    fireEvent.click(screen.getByRole("button", { name: "移除附件 guide.pdf" }));

    expect(items[0]!.onPreview).toHaveBeenCalledTimes(1);
    expect(items[1]!.onRemove).toHaveBeenCalledTimes(1);
    expect(screen.getByText("会话图片附件 1").closest("li")).toHaveAttribute(
      "title",
      "e31c779fc7a14e68b23cf94c999b0a61.jpeg~tplv-a9rns2rl98-image_raw_b.png",
    );
  });

  it("starts collapsed when requested and expands on demand", () => {
    render(
      <AttachmentList defaultCollapsed={true} items={buildItems()} testId="attachment-list" />,
    );

    expect(screen.getByText("附件 2")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "展开附件" })).toBeInTheDocument();
    expect(screen.queryByTestId("attachment-list")).not.toBeInTheDocument();
    expect(screen.queryByText("会话图片附件 1")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "展开附件" }));

    expect(screen.getByRole("button", { name: "收起附件" })).toBeInTheDocument();
    expect(screen.getByTestId("attachment-list")).toBeInTheDocument();
    expect(screen.getByText("会话图片附件 1")).toBeInTheDocument();
  });

  it("re-expands automatically when new items are added for the composer", () => {
    const { rerender } = render(
      <AttachmentList
        expandOnItemAdd={true}
        items={buildItems().slice(0, 1)}
        testId="attachment-list"
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "收起附件" }));
    expect(screen.queryByTestId("attachment-list")).not.toBeInTheDocument();

    rerender(
      <AttachmentList expandOnItemAdd={true} items={buildItems()} testId="attachment-list" />,
    );

    expect(screen.getByText("附件 2")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "收起附件" })).toBeInTheDocument();
    expect(screen.getByTestId("attachment-list")).toBeInTheDocument();
    expect(screen.getByText("guide.pdf")).toBeInTheDocument();
  });

  it("supports a compact card presentation for in-message attachments", () => {
    render(<AttachmentList items={buildItems()} testId="attachment-list" variant="compact" />);

    expect(screen.getByTestId("attachment-list")).toHaveAttribute(
      "data-attachment-list-variant",
      "compact",
    );
  });
});
