import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { http, HttpResponse } from "msw";
import { I18nextProvider } from "react-i18next";

import { QueryProvider } from "@/providers/query-provider";
import { i18n } from "@/i18n";
import { createTestServer, overrideHandler } from "@/test/msw";
import { TestRouter } from "@/test/test-router";
import type { KnowledgeDocument } from "../api/documents";
import { DocumentPreviewSheet } from "./document-preview-sheet";

declare const fetchMockCalls: Array<[string, RequestInit?]>;

vi.mock("@embedpdf/react-pdf-viewer", () => ({
  PDFViewer: ({
    config,
  }: {
    config?: { documentManager?: { initialDocuments?: Array<{ url?: string }> } };
  }) => (
    <div
      data-src={config?.documentManager?.initialDocuments?.[0]?.url ?? ""}
      data-testid="pdf-viewer"
    />
  ),
}));

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
    revision_no: 2,
    file_type: "md",
    ingest_status: "indexed",
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
    <TestRouter>
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
    </TestRouter>,
  );

  return { onDelete, onReindex, onShowVersions, onOpenChange };
}

describe("DocumentPreviewSheet", () => {
  beforeEach(() => {
    createTestServer();
    vi.spyOn(window, "open").mockImplementation(() => null);
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
    overrideHandler(
      http.get(
        "*/api/documents/revisions/:revisionId/file",
        () => new HttpResponse("# 标题\n\n正文", { status: 200 }),
      ),
    );

    renderSheet(buildDocument({}));

    expect(await screen.findByText("资源预览")).toBeInTheDocument();
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
    overrideHandler(
      http.get(
        "*/api/documents/revisions/:revisionId/file",
        () =>
          new HttpResponse(new Blob(["image"], { type: "image/png" }), {
            headers: { "Content-Type": "image/png" },
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
    overrideHandler(
      http.get(
        "*/api/documents/revisions/:revisionId/file",
        () => new HttpResponse("# not a heading", { status: 200 }),
      ),
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

  it("renders pdf previews inline in the sheet", async () => {
    renderSheet(
      buildDocument({
        id: 10,
        name: "guide.pdf",
        file_type: "pdf",
      }),
    );

    expect(await screen.findByTestId("pdf-viewer")).toHaveAttribute(
      "data-src",
      expect.stringContaining("/api/documents/revisions/10/file"),
    );
  });

  it("renders an unsupported preview fallback for docx files", async () => {
    renderSheet(
      buildDocument({
        id: 11,
        name: "report.docx",
        file_type: "docx",
      }),
    );

    expect(await screen.findByText("当前类型暂不支持内嵌预览")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "打开原文件" })).toBeInTheDocument();
  });

  it("renders processing and failed states without requesting text preview", async () => {
    renderSheet(
      buildDocument({
        id: 12,
        name: "queue.md",
        ingest_status: "processing",
      }),
    );
    expect(await screen.findByText("资源处理中，完成后可预览")).toBeInTheDocument();

    renderSheet(
      buildDocument({
        id: 13,
        name: "broken.md",
        ingest_status: "failed",
        error_message: "解析失败",
      }),
    );

    expect(await screen.findByText("资源预览失败")).toBeInTheDocument();
    expect(screen.getByText("解析失败")).toBeInTheDocument();
    expect(fetchMockCalls).toHaveLength(0);
  });

  it("calls version and reindex callbacks from the action area", async () => {
    overrideHandler(
      http.get(
        "*/api/documents/revisions/:revisionId/file",
        () => new HttpResponse("正文", { status: 200 }),
      ),
    );
    const { onReindex, onShowVersions } = renderSheet(buildDocument({}));

    expect(await screen.findByRole("button", { name: "查看版本" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "查看版本" }));
    fireEvent.click(screen.getByRole("button", { name: "重建索引" }));

    expect(onShowVersions).toHaveBeenCalledWith(20);
    expect(onReindex).toHaveBeenCalledWith(expect.objectContaining({ id: 2, name: "spec.md" }));
  });
});
