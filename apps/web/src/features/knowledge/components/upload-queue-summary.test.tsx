import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vite-plus/test";

import { UploadQueueSummary } from "./upload-queue-summary";

type UploadItem = {
  errorMessage?: string;
  id: string;
  name: string;
  progress: number;
  status: "failed" | "uploading";
};

function buildUploadingItem(overrides: Partial<UploadItem> = {}): UploadItem {
  return {
    id: "uploading-1",
    name: "draft.md",
    progress: 42,
    status: "uploading",
    ...overrides,
  };
}

function buildFailedItem(overrides: Partial<UploadItem> = {}): UploadItem {
  return {
    errorMessage: "网络中断",
    id: "failed-1",
    name: "broken.pdf",
    progress: 0,
    status: "failed",
    ...overrides,
  };
}

describe("UploadQueueSummary", () => {
  it("shows upload-only items expanded by default and lets the user collapse the queue", () => {
    render(
      <UploadQueueSummary
        items={[buildUploadingItem()]}
        onCancel={vi.fn()}
        onRemove={vi.fn()}
        onRetry={vi.fn()}
      />,
    );

    expect(screen.getByText("上传队列")).toBeInTheDocument();
    expect(screen.getByText("上传中 1 项")).toBeInTheDocument();
    expect(screen.getByText("draft.md")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "取消上传 draft.md" })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "收起" }));

    expect(screen.queryByText("draft.md")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "展开" })).toBeInTheDocument();
  });

  it("auto-expands when failures exist after the user collapsed the queue", () => {
    const onRemove = vi.fn();
    const onRetry = vi.fn();
    const failedItem = buildFailedItem();
    const view = render(
      <UploadQueueSummary
        items={[buildUploadingItem()]}
        onCancel={vi.fn()}
        onRemove={onRemove}
        onRetry={onRetry}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "收起" }));
    expect(screen.queryByText("broken.pdf")).not.toBeInTheDocument();

    view.rerender(
      <UploadQueueSummary
        items={[buildUploadingItem(), failedItem]}
        onCancel={vi.fn()}
        onRemove={onRemove}
        onRetry={onRetry}
      />,
    );

    expect(screen.getByText("broken.pdf")).toBeInTheDocument();
    expect(screen.getByText("draft.md")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "重试上传" }));
    fireEvent.click(screen.getByRole("button", { name: "移除上传项 broken.pdf" }));

    expect(onRetry).toHaveBeenCalledWith(failedItem.id);
    expect(onRemove).toHaveBeenCalledWith(failedItem.id);
  });
});
