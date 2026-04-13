import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, beforeEach, afterEach, vi } from "vite-plus/test";
import { I18nextProvider } from "react-i18next";

import { i18n } from "@/i18n";
import { QueryProvider } from "@/providers/query-provider";
import type { KnowledgeDocument } from "../api/documents";
import { DocumentMainPreview } from "./document-main-preview";

const protectedFileMocks = vi.hoisted(() => ({
  fetchProtectedFile: vi.fn(async () => new Response(null, { status: 200 })),
  openProtectedFile: vi.fn(async () => {}),
  downloadProtectedFile: vi.fn(async () => {}),
}));

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

vi.mock("@/lib/api/protected-file", () => ({
  fetchProtectedFile: protectedFileMocks.fetchProtectedFile,
}));

vi.mock("@/features/knowledge/components/protected-file-actions", () => ({
  openProtectedFile: protectedFileMocks.openProtectedFile,
  downloadProtectedFile: protectedFileMocks.downloadProtectedFile,
}));

function buildDocument(overrides: Partial<KnowledgeDocument>): KnowledgeDocument {
  return {
    id: 2,
    document_id: 20,
    name: "spec.md",
    logical_name: "spec",
    revision_no: 2,
    file_type: "md",
    ingest_status: "indexed",
    is_latest: true,
    file_size: 256,
    chunk_count: 12,
    error_message: null,
    created_at: "2026-03-22T01:00:00Z",
    updated_at: "2026-03-22T02:00:00Z",
    ...overrides,
  };
}

function renderPreview(document: KnowledgeDocument | null) {
  render(
    <QueryProvider>
      <I18nextProvider i18n={i18n}>
        <DocumentMainPreview document={document} />
      </I18nextProvider>
    </QueryProvider>,
  );
}

describe("DocumentMainPreview", () => {
  beforeEach(() => {
    protectedFileMocks.fetchProtectedFile.mockClear();
    vi.spyOn(window, "open").mockImplementation(() => null);
    vi.stubGlobal(
      "URL",
      Object.assign(URL, {
        createObjectURL: vi.fn(() => "blob:main-preview"),
        revokeObjectURL: vi.fn(),
      }),
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("renders the empty state when no document is selected", () => {
    renderPreview(null);

    expect(screen.getByText("暂无匹配资源")).toBeInTheDocument();
    expect(
      screen.getByText("当前筛选条件下没有匹配资源，试试更换关键词、类型或状态。"),
    ).toBeInTheDocument();
  });

  it("shows processing and failed previews without loading file content", () => {
    renderPreview(
      buildDocument({
        id: 5,
        ingest_status: "processing",
      }),
    );

    expect(screen.getByText("资源处理中，完成后可预览")).toBeInTheDocument();

    renderPreview(
      buildDocument({
        id: 6,
        ingest_status: "failed",
        error_message: "解析失败",
      }),
    );

    expect(screen.getByText("资源预览失败")).toBeInTheDocument();
    expect(screen.getByText("解析失败")).toBeInTheDocument();
    expect(protectedFileMocks.fetchProtectedFile).not.toHaveBeenCalled();
  });

  it("renders pdf previews inline with embedpdf", async () => {
    renderPreview(
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
    expect(protectedFileMocks.fetchProtectedFile).not.toHaveBeenCalled();
  });

  it("renders unsupported fallback content and opens the original file", async () => {
    renderPreview(
      buildDocument({
        id: 11,
        name: "report.docx",
        file_type: "docx",
      }),
    );

    const unsupportedText = await screen.findByText("当前类型暂不支持内嵌预览");
    expect(unsupportedText).toBeInTheDocument();

    const openButton = screen.getByRole("button", { name: "打开原文件" });
    fireEvent.click(openButton);

    await waitFor(() => {
      expect(protectedFileMocks.openProtectedFile).toHaveBeenCalled();
    });
  });
});
