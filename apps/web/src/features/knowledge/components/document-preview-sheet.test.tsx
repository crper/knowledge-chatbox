import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { I18nextProvider } from "react-i18next";
import { MemoryRouter } from "react-router-dom";

import { QueryProvider } from "@/providers/query-provider";
import { i18n } from "@/i18n";
import type { KnowledgeDocument } from "../api/documents";
import { DocumentPreviewSheet } from "./document-preview-sheet";

vi.mock("@/features/chat/components/markdown-message", () => ({
  MarkdownMessage: ({ content }: { content: string }) => (
    <div data-testid="markdown-preview">{content}</div>
  ),
}));

function buildDocument(overrides: Partial<KnowledgeDocument>): KnowledgeDocument {
  return {
    id: 2,
    document_id: 20,
    name: "spec.md",
    version: 2,
    file_type: "md",
    status: "indexed",
    is_latest: true,
    file_size: 256,
    chunk_count: 12,
    created_at: "2026-03-22T01:00:00Z",
    updated_at: "2026-03-22T02:00:00Z",
    ...overrides,
  };
}

function renderSheet(document: KnowledgeDocument) {
  const onDelete = vi.fn();
  const onReindex = vi.fn();
  const onShowVersions = vi.fn();
  const onOpenChange = vi.fn();

  render(
    <MemoryRouter>
      <QueryProvider>
        <I18nextProvider i18n={i18n}>
          <DocumentPreviewSheet
            document={document}
            onDelete={onDelete}
            onOpenChange={onOpenChange}
            onReindex={onReindex}
            onShowVersions={onShowVersions}
            open
          />
        </I18nextProvider>
      </QueryProvider>
    </MemoryRouter>,
  );

  return { onDelete, onReindex, onShowVersions, onOpenChange };
}

describe("DocumentPreviewSheet", () => {
  beforeEach(() => {
    vi.spyOn(window, "open").mockImplementation(() => null);
    vi.stubGlobal("fetch", vi.fn());
    vi.stubGlobal(
      "URL",
      Object.assign(URL, {
        createObjectURL: vi.fn(() => "blob:document-preview"),
        revokeObjectURL: vi.fn(),
      }),
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("renders markdown previews with summary badges and actions", async () => {
    vi.mocked(fetch).mockResolvedValue(
      new Response("# 标题\n\n正文", {
        status: 200,
      }),
    );

    renderSheet(buildDocument({}));

    expect(screen.getByText("资源预览")).toBeInTheDocument();
    expect(screen.getByText("spec.md")).toBeInTheDocument();
    expect(screen.getByText("Markdown")).toBeInTheDocument();
    expect(screen.getAllByText("v2").length).toBeGreaterThan(0);
    expect(screen.getAllByText("已索引").length).toBeGreaterThan(0);

    expect(await screen.findByTestId("markdown-preview")).toHaveTextContent("# 标题");
    expect(screen.getByRole("button", { name: "查看版本" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "前往对话页" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "打开原文件" })).toBeInTheDocument();
  });

  it("renders image previews inline", async () => {
    vi.mocked(fetch).mockImplementation(() =>
      Promise.resolve(
        new Response(new Blob(["image"], { type: "image/png" }), {
          status: 200,
        }),
      ),
    );

    renderSheet(
      buildDocument({
        id: 8,
        name: "cover.png",
        file_type: "png",
      }),
    );

    expect(await screen.findByRole("img", { name: "cover.png" })).toBeInTheDocument();
  });

  it("renders txt previews as plain text instead of markdown", async () => {
    vi.mocked(fetch).mockResolvedValue(
      new Response("# not a heading", {
        status: 200,
      }),
    );

    renderSheet(
      buildDocument({
        id: 9,
        name: "notes.txt",
        file_type: "txt",
      }),
    );

    await waitFor(() => {
      expect(screen.getByText("# not a heading")).toBeInTheDocument();
    });
    expect(screen.queryByTestId("markdown-preview")).not.toBeInTheDocument();
  });

  it("renders a pdf fallback that opens in a new tab", () => {
    renderSheet(
      buildDocument({
        id: 10,
        name: "guide.pdf",
        file_type: "pdf",
      }),
    );

    expect(screen.getByText("PDF 预览将通过浏览器在新标签打开")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "在新标签打开 PDF" })).toBeInTheDocument();
  });

  it("renders an unsupported preview fallback for docx files", () => {
    renderSheet(
      buildDocument({
        id: 11,
        name: "report.docx",
        file_type: "docx",
      }),
    );

    expect(screen.getByText("当前类型暂不支持内嵌预览")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "打开原文件" })).toBeInTheDocument();
  });

  it("renders processing and failed states without requesting text preview", () => {
    renderSheet(
      buildDocument({
        id: 12,
        name: "queue.md",
        status: "processing",
      }),
    );
    expect(screen.getByText("资源处理中，完成后可预览")).toBeInTheDocument();

    renderSheet(
      buildDocument({
        id: 13,
        name: "broken.md",
        status: "failed",
        error_message: "解析失败",
      }),
    );

    expect(screen.getByText("资源预览失败")).toBeInTheDocument();
    expect(screen.getByText("解析失败")).toBeInTheDocument();
    expect(fetch).not.toHaveBeenCalled();
  });

  it("calls version and reindex callbacks from the action area", async () => {
    vi.mocked(fetch).mockResolvedValue(
      new Response("正文", {
        status: 200,
      }),
    );
    const { onReindex, onShowVersions } = renderSheet(buildDocument({}));

    fireEvent.click(screen.getByRole("button", { name: "查看版本" }));
    fireEvent.click(screen.getByRole("button", { name: "重建索引" }));

    expect(onShowVersions).toHaveBeenCalledWith(2);
    expect(onReindex).toHaveBeenCalledWith(expect.objectContaining({ id: 2, name: "spec.md" }));
  });
});
