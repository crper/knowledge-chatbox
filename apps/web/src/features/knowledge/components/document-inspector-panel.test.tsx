import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, beforeEach, vi } from "vite-plus/test";
import { http } from "msw";
import { I18nextProvider } from "react-i18next";

import { i18n } from "@/i18n";
import { QueryProvider } from "@/providers/query-provider";
import { TestRouter } from "@/test/test-router";
import { apiResponse, createTestServer, overrideHandler } from "@/test/msw";
import type { KnowledgeDocument } from "../api/documents";
import { DocumentInspectorPanel } from "./document-inspector-panel";

function buildDocument(overrides: Partial<KnowledgeDocument>): KnowledgeDocument {
  return {
    id: 2,
    document_id: 20,
    name: "spec.md",
    logical_name: "spec",
    version: 2,
    file_type: "md",
    status: "indexed",
    is_latest: true,
    file_size: 256,
    chunk_count: 12,
    error_message: null,
    created_at: "2026-03-22T01:00:00Z",
    updated_at: "2026-03-22T02:00:00Z",
    ...overrides,
  };
}

function renderInspector(document: KnowledgeDocument | null) {
  const onDelete = vi.fn();
  const onReindex = vi.fn();

  render(
    <TestRouter initialEntry="/knowledge" path="/knowledge">
      <QueryProvider>
        <I18nextProvider i18n={i18n}>
          <DocumentInspectorPanel document={document} onDelete={onDelete} onReindex={onReindex} />
        </I18nextProvider>
      </QueryProvider>
    </TestRouter>,
  );

  return { onDelete, onReindex };
}

describe("DocumentInspectorPanel", () => {
  beforeEach(() => {
    createTestServer();
    overrideHandler(http.get("*/api/documents/:documentId/revisions", () => apiResponse([])));
  });

  it("renders empty state when no document is selected", async () => {
    renderInspector(null);

    expect(await screen.findByText("暂无匹配资源")).toBeInTheDocument();
    expect(
      screen.getByText("当前筛选条件下没有匹配资源，试试更换关键词、类型或状态。"),
    ).toBeInTheDocument();
  });

  it("switches to the versions tab and renders empty versions feedback", async () => {
    renderInspector(buildDocument({}));

    expect(await screen.findByText("Inspector")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("tab", { name: "查看版本" }));

    expect(await screen.findByText("暂无历史版本")).toBeInTheDocument();
    expect(screen.getByText("当前资源还没有可展示的版本记录。")).toBeInTheDocument();
  });

  it("fires reindex and delete actions from the actions tab", async () => {
    const { onDelete, onReindex } = renderInspector(buildDocument({ id: 12, name: "guide.pdf" }));

    fireEvent.click(await screen.findByRole("tab", { name: "资源列表" }));
    fireEvent.click(screen.getByRole("button", { name: "重建索引" }));
    fireEvent.click(screen.getByRole("button", { name: "删除" }));

    expect(onReindex).toHaveBeenCalledWith(expect.objectContaining({ id: 12, name: "guide.pdf" }));
    expect(onDelete).toHaveBeenCalledWith(expect.objectContaining({ id: 12, name: "guide.pdf" }));
  });
});
