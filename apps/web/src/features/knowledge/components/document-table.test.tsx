import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { VirtuosoMockContext } from "react-virtuoso";
import { I18nextProvider } from "react-i18next";

import { i18n } from "../../../i18n";
import type { KnowledgeDocument } from "../api/documents";
import { DocumentTable } from "./document-table";

const documents: KnowledgeDocument[] = [
  {
    id: 2,
    document_id: 20,
    name: "spec.md",
    version: 2,
    status: "indexed",
    is_latest: true,
    file_type: "md",
    created_at: "2026-03-19T08:00:00Z",
    updated_at: "2026-03-19T09:00:00Z",
  },
  {
    id: 1,
    document_id: 10,
    name: "guide.pdf",
    version: 1,
    status: "processing",
    is_latest: true,
    file_type: "pdf",
    created_at: "2026-03-18T08:00:00Z",
    updated_at: "2026-03-18T09:00:00Z",
  },
];

function buildDocuments(count: number): KnowledgeDocument[] {
  return Array.from({ length: count }, (_, index) => ({
    id: index + 1,
    document_id: index + 100,
    name: `document-${index + 1}.md`,
    version: 1,
    status: "indexed",
    is_latest: true,
    file_type: "md",
    created_at: "2026-03-19T08:00:00Z",
    updated_at: "2026-03-19T09:00:00Z",
  }));
}

describe("DocumentTable", () => {
  afterEach(async () => {
    await act(async () => {
      await i18n.changeLanguage("zh-CN");
    });
  });

  it("sorts rows by name when the header is clicked", () => {
    render(
      <I18nextProvider i18n={i18n}>
        <DocumentTable
          canDelete
          documents={documents}
          onDelete={() => {}}
          onPreviewDocument={() => {}}
          onReindex={() => {}}
          onSelectDocument={() => {}}
          onShowVersions={() => {}}
          selectedDocumentId={null}
        />
      </I18nextProvider>,
    );

    fireEvent.click(screen.getByRole("button", { name: "名称" }));

    const rows = screen.getAllByRole("row").slice(1);
    expect(within(rows[0]!).getByText("guide.pdf")).toBeInTheDocument();
    expect(within(rows[1]!).getByText("spec.md")).toBeInTheDocument();
  });

  it("renders an empty state when there is no data", () => {
    render(
      <I18nextProvider i18n={i18n}>
        <DocumentTable
          canDelete
          documents={[]}
          onDelete={() => {}}
          onPreviewDocument={() => {}}
          onReindex={() => {}}
          onSelectDocument={() => {}}
          onShowVersions={() => {}}
          selectedDocumentId={null}
        />
      </I18nextProvider>,
    );

    expect(screen.getByText("暂无资源")).toBeInTheDocument();
  });

  it("renders compact columns and preview actions", () => {
    render(
      <I18nextProvider i18n={i18n}>
        <DocumentTable
          canDelete
          documents={documents}
          onDelete={() => {}}
          onPreviewDocument={() => {}}
          onReindex={() => {}}
          onSelectDocument={() => {}}
          onShowVersions={() => {}}
          selectedDocumentId={null}
        />
      </I18nextProvider>,
    );

    expect(screen.getByRole("button", { name: "分类" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "更新时间" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "创建时间" })).not.toBeInTheDocument();
    expect(screen.getByText("Markdown")).toBeInTheDocument();
    expect(screen.getByText("PDF")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "预览 spec.md" })).toBeInTheDocument();
  });

  it("calls row action callbacks without relying on row selection", () => {
    const onDelete = vi.fn();
    const onPreviewDocument = vi.fn();
    const onReindex = vi.fn();
    const onShowVersions = vi.fn();

    render(
      <I18nextProvider i18n={i18n}>
        <DocumentTable
          canDelete
          documents={documents}
          onDelete={onDelete}
          onPreviewDocument={onPreviewDocument}
          onReindex={onReindex}
          onSelectDocument={() => {}}
          onShowVersions={onShowVersions}
          selectedDocumentId={null}
        />
      </I18nextProvider>,
    );

    fireEvent.click(screen.getByRole("button", { name: "预览 spec.md" }));
    fireEvent.click(screen.getAllByRole("button", { name: "查看版本" })[0]!);
    fireEvent.click(screen.getAllByRole("button", { name: "重建索引" })[0]!);
    fireEvent.click(screen.getAllByRole("button", { name: "删除" })[0]!);

    expect(onPreviewDocument).toHaveBeenCalledWith(documents[0]);
    expect(onShowVersions).toHaveBeenCalledWith(documents[0]!.document_id);
    expect(onReindex).toHaveBeenCalledWith(documents[0]);
    expect(onDelete).toHaveBeenCalledWith(documents[0]);
  });

  it("formats timestamps with the active language", async () => {
    await act(async () => {
      await i18n.changeLanguage("en");
    });
    const expectedUpdatedAt = new Intl.DateTimeFormat("en", {
      hour: "2-digit",
      minute: "2-digit",
      month: "2-digit",
      day: "2-digit",
      year: "numeric",
    }).format(new Date(documents[0]!.updated_at));

    render(
      <I18nextProvider i18n={i18n}>
        <DocumentTable
          canDelete
          documents={documents}
          onDelete={() => {}}
          onPreviewDocument={() => {}}
          onReindex={() => {}}
          onSelectDocument={() => {}}
          onShowVersions={() => {}}
          selectedDocumentId={null}
        />
      </I18nextProvider>,
    );

    expect(screen.getByRole("button", { name: "Updated" })).toBeInTheDocument();
    expect(screen.getByText(expectedUpdatedAt)).toBeInTheDocument();
  });

  it("virtualizes long resource lists instead of mounting every row action at once", () => {
    render(
      <VirtuosoMockContext.Provider value={{ itemHeight: 60, viewportHeight: 360 }}>
        <I18nextProvider i18n={i18n}>
          <div style={{ height: "360px" }}>
            <DocumentTable
              canDelete
              documents={buildDocuments(120)}
              onDelete={() => {}}
              onPreviewDocument={() => {}}
              onReindex={() => {}}
              onSelectDocument={() => {}}
              onShowVersions={() => {}}
              selectedDocumentId={null}
            />
          </div>
        </I18nextProvider>
      </VirtuosoMockContext.Provider>,
    );

    expect(screen.getByRole("button", { name: "预览 document-1.md" })).toBeInTheDocument();
    const previewActions = screen.getAllByRole("button", { name: /预览 document-/ });
    expect(previewActions.length).toBeLessThan(120);
  });
});
