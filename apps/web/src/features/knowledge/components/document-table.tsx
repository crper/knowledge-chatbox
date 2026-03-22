/**
 * @file 资源相关界面组件模块。
 */

import { useTranslation } from "react-i18next";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { DataTable } from "@/components/shared/data-table";
import type { KnowledgeDocument } from "../api/documents";
import type { ColumnDef } from "@tanstack/react-table";
import {
  formatKnowledgeDocumentDateTime,
  getKnowledgeDocumentCategoryLabel,
  getKnowledgeDocumentStatusMeta,
} from "./resource-document-helpers";

type DocumentTableProps = {
  canDelete: boolean;
  documents: KnowledgeDocument[];
  onDelete: (document: KnowledgeDocument) => void;
  onPreviewDocument: (document: KnowledgeDocument) => void;
  onReindex: (document: KnowledgeDocument) => void;
  onSelectDocument: (document: KnowledgeDocument) => void;
  onShowVersions: (documentId: number) => void;
  selectedDocumentId: number | null;
};

/**
 * 渲染文档表格。
 */
export function DocumentTable({
  canDelete,
  documents,
  onDelete,
  onPreviewDocument,
  onReindex,
  onSelectDocument,
  onShowVersions,
  selectedDocumentId,
}: DocumentTableProps) {
  const { i18n, t } = useTranslation("knowledge");
  const columns: ColumnDef<KnowledgeDocument>[] = [
    {
      accessorKey: "name",
      cell: ({ row }) => <span className="font-medium">{row.original.name}</span>,
      header: t("nameColumn"),
    },
    {
      accessorKey: "file_type",
      cell: ({ row }) => getKnowledgeDocumentCategoryLabel(row.original.file_type, t),
      header: t("categoryColumn"),
    },
    {
      accessorKey: "version",
      cell: ({ row }) => t("versionValue", { version: row.original.version }),
      header: t("versionColumn"),
    },
    {
      accessorKey: "status",
      cell: ({ row }) => {
        const meta = getKnowledgeDocumentStatusMeta(row.original.status, t);

        return <Badge variant={meta.variant}>{meta.label}</Badge>;
      },
      header: t("statusColumn"),
    },
    {
      accessorKey: "updated_at",
      cell: ({ row }) =>
        formatKnowledgeDocumentDateTime(row.original.updated_at, i18n.resolvedLanguage ?? "zh-CN"),
      header: t("updatedAtColumn"),
    },
    {
      cell: ({ row }) => (
        <div className="flex gap-2">
          <Button
            aria-label={t("previewActionWithName", { name: row.original.name })}
            onClick={(event) => {
              event.stopPropagation();
              onPreviewDocument(row.original);
            }}
            size="sm"
            type="button"
            variant="outline"
          >
            {t("previewAction")}
          </Button>
          <Button
            onClick={(event) => {
              event.stopPropagation();
              onShowVersions(row.original.document_id);
            }}
            size="sm"
            type="button"
            variant="ghost"
          >
            {t("viewVersionsAction")}
          </Button>
          {canDelete ? (
            <Button
              onClick={(event) => {
                event.stopPropagation();
                onReindex(row.original);
              }}
              size="sm"
              type="button"
              variant="ghost"
            >
              {t("reindexAction")}
            </Button>
          ) : null}
          {canDelete ? (
            <Button
              onClick={(event) => {
                event.stopPropagation();
                onDelete(row.original);
              }}
              size="sm"
              type="button"
              variant="ghost"
            >
              {t("deleteAction")}
            </Button>
          ) : null}
        </div>
      ),
      enableSorting: false,
      header: t("actionsColumn"),
      id: "actions",
    },
  ];

  return (
    <DataTable
      columns={columns}
      data={documents}
      emptyMessage={t("emptyState")}
      getRowId={(row) => String(row.id)}
      onRowClick={(row) => {
        onSelectDocument(row);
        onPreviewDocument(row);
      }}
      selectedRowId={selectedDocumentId === null ? null : String(selectedDocumentId)}
      virtualized
    />
  );
}
