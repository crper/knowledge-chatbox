import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vite-plus/test";

import type { KnowledgeDocument } from "../api/documents";
import { SelectedResourceBand } from "./selected-resource-band";

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

describe("SelectedResourceBand", () => {
  it("shows the selected resource summary and high-frequency actions", () => {
    const document = buildDocument();
    const onPreviewDocument = vi.fn();
    const onShowVersions = vi.fn();

    render(
      <SelectedResourceBand
        document={document}
        onPreviewDocument={onPreviewDocument}
        onShowVersions={onShowVersions}
      />,
    );

    expect(screen.getByText("当前资源")).toBeInTheDocument();
    expect(screen.getByText("spec.pdf")).toBeInTheDocument();
    expect(screen.getByText("季度知识库")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "预览 spec.pdf" }));
    fireEvent.click(screen.getByRole("button", { name: "查看版本" }));

    expect(onPreviewDocument).toHaveBeenCalledWith(document);
    expect(onShowVersions).toHaveBeenCalledWith(document.document_id);
  });

  it("renders nothing when document is null", () => {
    const { container } = render(
      <SelectedResourceBand document={null} onPreviewDocument={vi.fn()} onShowVersions={vi.fn()} />,
    );

    expect(container).toBeEmptyDOMElement();
  });
});
