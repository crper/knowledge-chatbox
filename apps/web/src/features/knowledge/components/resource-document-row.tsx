/**
 * @file 资源行卡组件模块。
 */

import {
  EyeIcon,
  FolderOpenIcon,
  MoreHorizontalIcon,
  Trash2Icon,
  RotateCcwIcon,
} from "lucide-react";
import { useTranslation } from "react-i18next";

import type { KnowledgeDocument } from "../api/documents";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import {
  formatKnowledgeDocumentDateTime,
  getKnowledgeDocumentCategoryLabel,
  getKnowledgeDocumentStatusMeta,
} from "./resource-document-helpers";

type ResourceDocumentRowProps = {
  canDelete: boolean;
  document: KnowledgeDocument;
  isSelected: boolean;
  onDelete: (document: KnowledgeDocument) => void;
  onPreviewDocument: (document: KnowledgeDocument) => void;
  onReindex: (document: KnowledgeDocument) => void;
  onSelectDocument: (document: KnowledgeDocument) => void;
  onShowVersions: (documentId: number) => void;
};

/**
 * 渲染资源行卡。
 */
export function ResourceDocumentRow({
  canDelete,
  document,
  isSelected,
  onDelete,
  onPreviewDocument,
  onReindex,
  onSelectDocument,
  onShowVersions,
}: ResourceDocumentRowProps) {
  const { i18n, t } = useTranslation("knowledge");
  const statusMeta = getKnowledgeDocumentStatusMeta(document.status, t);
  const logicalName = document.logical_name || t("rowLogicalNameFallback");

  return (
    <article
      className={cn(
        "surface-outline grid gap-2.5 rounded-[1.25rem] px-3 py-2.5 transition-[border-color,background-color,box-shadow] md:grid-cols-[minmax(0,1.4fr)_minmax(10rem,0.72fr)_auto] md:items-center md:px-4",
        isSelected &&
          "border-primary/25 bg-[linear-gradient(135deg,hsl(var(--primary)/0.08),transparent_48%),linear-gradient(180deg,hsl(var(--surface-highlight)/0.06),transparent_52%),hsl(var(--surface-base)/0.12)] shadow-[0_18px_34px_-28px_hsl(var(--primary)/0.28)]",
      )}
      data-state={isSelected ? "selected" : "idle"}
    >
      <button
        aria-label={document.name}
        className="grid min-w-0 gap-2 rounded-[1rem] text-left outline-none transition-transform focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
        onClick={() => onSelectDocument(document)}
        type="button"
      >
        <div className="min-w-0">
          <p className="truncate text-[0.98rem] font-medium tracking-[-0.018em] text-foreground">
            {document.name}
          </p>
          <p className="truncate text-xs text-muted-foreground">{logicalName}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Badge variant="outline">
            {getKnowledgeDocumentCategoryLabel(document.file_type, t)}
          </Badge>
          <Badge variant="outline">{t("versionValue", { version: document.version })}</Badge>
        </div>
      </button>

      <div className="grid gap-2 md:justify-items-start">
        <Badge variant={statusMeta.variant}>{statusMeta.label}</Badge>
        <p className="text-xs text-muted-foreground">
          {t("rowUpdatedLabel")}{" "}
          {formatKnowledgeDocumentDateTime(document.updated_at, i18n.resolvedLanguage ?? "zh-CN")}
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-2 md:justify-self-end">
        <Button
          aria-label={t("previewActionWithName", { name: document.name })}
          onClick={() => onPreviewDocument(document)}
          size="sm"
          type="button"
          variant="outline"
        >
          <EyeIcon data-icon="inline-start" />
          {t("previewAction")}
        </Button>
        <Button
          onClick={() => onShowVersions(document.document_id)}
          size="sm"
          type="button"
          variant="ghost"
        >
          <FolderOpenIcon data-icon="inline-start" />
          {t("viewVersionsAction")}
        </Button>
        {canDelete ? (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                aria-label={t("rowOpenMenuAction", { name: document.name })}
                size="icon-sm"
                type="button"
                variant="ghost"
              >
                <MoreHorizontalIcon />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="min-w-44">
              <DropdownMenuItem onSelect={() => onReindex(document)}>
                <RotateCcwIcon />
                <span>{t("reindexAction")}</span>
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={() => onDelete(document)} variant="destructive">
                <Trash2Icon />
                <span>{t("deleteAction")}</span>
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        ) : null}
      </div>
    </article>
  );
}
