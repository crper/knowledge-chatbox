import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vite-plus/test";

import type { KnowledgeDocument } from "../api/documents";
import { ResourceDocumentList } from "./resource-document-list";

function buildDocument(overrides: Partial<KnowledgeDocument> = {}): KnowledgeDocument {
  return {
    chunk_count: 4,
    created_at: "2026-03-19T08:00:00Z",
    document_id: 20,
    file_size: 2048,
    file_type: "pdf",
    id: 2,
    is_latest: true,
    logical_name: "季度知识库",
    name: "spec.pdf",
    status: "indexed",
    updated_at: "2026-03-19T09:00:00Z",
    version: 2,
    ...overrides,
  };
}

describe("ResourceDocumentList", () => {
  it("selects a row without opening preview", () => {
    const onDelete = vi.fn();
    const onPreviewDocument = vi.fn();
    const onReindex = vi.fn();
    const onSelectDocument = vi.fn();
    const onShowVersions = vi.fn();
    const document = buildDocument();

    render(
      <ResourceDocumentList
        canDelete
        documents={[document]}
        onDelete={onDelete}
        onPreviewDocument={onPreviewDocument}
        onReindex={onReindex}
        onSelectDocument={onSelectDocument}
        onShowVersions={onShowVersions}
        selectedDocumentId={null}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "spec.pdf" }));

    expect(onSelectDocument).toHaveBeenCalledWith(document);
    expect(onPreviewDocument).not.toHaveBeenCalled();
  });

  it("opens preview and version from explicit actions", () => {
    const onDelete = vi.fn();
    const onPreviewDocument = vi.fn();
    const onReindex = vi.fn();
    const onSelectDocument = vi.fn();
    const onShowVersions = vi.fn();
    const document = buildDocument();

    render(
      <ResourceDocumentList
        canDelete
        documents={[document]}
        onDelete={onDelete}
        onPreviewDocument={onPreviewDocument}
        onReindex={onReindex}
        onSelectDocument={onSelectDocument}
        onShowVersions={onShowVersions}
        selectedDocumentId={document.id}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "预览 spec.pdf" }));
    fireEvent.click(screen.getByRole("button", { name: "查看版本" }));

    expect(onPreviewDocument).toHaveBeenCalledWith(document);
    expect(onShowVersions).toHaveBeenCalledWith(document.document_id);
  });

  it("moves reindex and delete into the more menu", () => {
    const onDelete = vi.fn();
    const onPreviewDocument = vi.fn();
    const onReindex = vi.fn();
    const onSelectDocument = vi.fn();
    const onShowVersions = vi.fn();
    const document = buildDocument();

    render(
      <ResourceDocumentList
        canDelete
        documents={[document]}
        onDelete={onDelete}
        onPreviewDocument={onPreviewDocument}
        onReindex={onReindex}
        onSelectDocument={onSelectDocument}
        onShowVersions={onShowVersions}
        selectedDocumentId={document.id}
      />,
    );

    fireEvent.pointerDown(screen.getByRole("button", { name: "更多操作 spec.pdf" }));
    fireEvent.click(screen.getByRole("menuitem", { name: "重建索引" }));
    fireEvent.pointerDown(screen.getByRole("button", { name: "更多操作 spec.pdf" }));
    fireEvent.click(screen.getByRole("menuitem", { name: "删除" }));

    expect(onReindex).toHaveBeenCalledWith(document);
    expect(onDelete).toHaveBeenCalledWith(document);
  });

  it("switches to a virtualized viewport for large resource collections", () => {
    const onDelete = vi.fn();
    const onPreviewDocument = vi.fn();
    const onReindex = vi.fn();
    const onSelectDocument = vi.fn();
    const onShowVersions = vi.fn();
    const documents = Array.from({ length: 40 }, (_, index) =>
      buildDocument({
        document_id: index + 1,
        id: index + 1,
        logical_name: `逻辑名-${index + 1}`,
        name: `resource-${index + 1}.pdf`,
      }),
    );

    render(
      <div style={{ height: "40rem" }}>
        <ResourceDocumentList
          canDelete
          documents={documents}
          onDelete={onDelete}
          onPreviewDocument={onPreviewDocument}
          onReindex={onReindex}
          onSelectDocument={onSelectDocument}
          onShowVersions={onShowVersions}
          selectedDocumentId={null}
        />
      </div>,
    );

    expect(screen.getByTestId("resource-document-list-virtual-scroll")).toBeInTheDocument();
  });
});
