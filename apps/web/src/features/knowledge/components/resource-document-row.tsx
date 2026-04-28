import { memo } from "react";
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
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";
import { cn } from "@/lib/utils";
import { formatDateTime, useDateLocale } from "@/lib/date-utils";
import {
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

export const ResourceDocumentRow = memo(function ResourceDocumentRow({
  canDelete,
  document,
  isSelected,
  onDelete,
  onPreviewDocument,
  onReindex,
  onSelectDocument,
  onShowVersions,
}: ResourceDocumentRowProps) {
  const { t } = useTranslation("knowledge");
  const dateLocale = useDateLocale();
  const statusMeta = getKnowledgeDocumentStatusMeta(document.ingest_status, t);
  const logicalName = document.logical_name || t("rowLogicalNameFallback");

  return (
    <ContextMenu>
      <ContextMenuTrigger className="contents">
        <article
          className={cn(
            "group relative grid gap-3 px-4 py-3.5 transition-all duration-200 ease-out",
            "first:rounded-t-xl last:rounded-b-xl",
            "hover:bg-muted/40",
            "active:scale-[0.998]",
            "focus-within:bg-muted/30",
            isSelected && [
              "bg-primary/4 border-l-[3px] border-l-primary/70 pl-[calc(1rem-3px)]",
              "shadow-[inset_0_0_24px_-12px_hsl(var(--primary)/0.10)]",
            ],
          )}
          data-state={isSelected ? "selected" : "idle"}
        >
          <button
            aria-label={document.name}
            className="grid min-w-0 gap-1.5 text-left outline-none transition-transform duration-200 focus-visible:ring-2 focus-visible:ring-ring/40 focus-visible:ring-offset-2 focus-visible:ring-offset-background rounded-lg"
            onClick={() => onSelectDocument(document)}
            type="button"
          >
            <div className="min-w-0 flex items-center gap-3">
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold text-foreground tracking-tight leading-snug">
                  {document.name}
                </p>
                <p className="truncate text-xs text-muted-foreground/80 mt-0.5">{logicalName}</p>
              </div>
            </div>

            <div className="flex items-center gap-2 flex-wrap">
              <Badge className="font-medium text-[11px] px-2 py-0 h-6 rounded-md" variant="outline">
                {getKnowledgeDocumentCategoryLabel(document.file_type, t)}
              </Badge>
              <Badge
                className="font-medium text-[11px] px-2 py-0 h-6 rounded-md"
                variant="secondary"
              >
                v{document.revision_no}
              </Badge>
              <Badge
                className={cn(
                  "font-medium text-[11px] px-2 py-0 h-6 rounded-md",
                  statusMeta.variant === "secondary" &&
                    "bg-muted/60 text-muted-foreground border-border/50",
                  statusMeta.variant === "destructive" &&
                    "bg-destructive/8 text-destructive border-destructive/20",
                  statusMeta.variant === "outline" && "bg-transparent",
                )}
                variant={statusMeta.variant}
              >
                {statusMeta.label}
              </Badge>
              <span className="text-[11px] text-muted-foreground/60 tabular-nums ml-auto">
                {formatDateTime(document.updated_at, dateLocale) || document.updated_at}
              </span>
            </div>
          </button>

          <div className="flex items-center gap-1.5 opacity-0 transition-opacity duration-200 group-hover:opacity-100 group-focus-within:opacity-100">
            <Button
              aria-label={t("previewActionWithName", { name: document.name })}
              className="h-7 gap-1.5 text-xs font-medium"
              onClick={(e) => {
                e.stopPropagation();
                onPreviewDocument(document);
              }}
              size="sm"
              type="button"
              variant="ghost"
            >
              <EyeIcon className="size-3.5" />
              {t("previewAction")}
            </Button>
            <Button
              className="h-7 gap-1.5 text-xs font-medium"
              onClick={(e) => {
                e.stopPropagation();
                onShowVersions(document.document_id);
              }}
              size="sm"
              type="button"
              variant="ghost"
            >
              <FolderOpenIcon className="size-3.5" />
              {t("viewVersionsAction")}
            </Button>
            {canDelete ? (
              <DropdownMenu>
                <DropdownMenuTrigger
                  render={
                    <Button
                      aria-label={t("rowOpenMenuAction", { name: document.name })}
                      className="h-7 size-7"
                      size="icon-sm"
                      type="button"
                      variant="ghost"
                      onClick={(e) => e.stopPropagation()}
                    />
                  }
                >
                  <MoreHorizontalIcon className="size-3.5" />
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="min-w-40">
                  <DropdownMenuItem onClick={() => onReindex(document)}>
                    <RotateCcwIcon className="size-3.5" />
                    <span className="text-xs">{t("reindexAction")}</span>
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => onDelete(document)} variant="destructive">
                    <Trash2Icon className="size-3.5" />
                    <span className="text-xs">{t("deleteAction")}</span>
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            ) : null}
          </div>
        </article>
      </ContextMenuTrigger>
      {canDelete ? (
        <ContextMenuContent>
          <ContextMenuItem onClick={() => onReindex(document)}>
            <RotateCcwIcon />
            <span>{t("reindexAction")}</span>
          </ContextMenuItem>
          <ContextMenuSeparator />
          <ContextMenuItem onClick={() => onDelete(document)} variant="destructive">
            <Trash2Icon />
            <span>{t("deleteAction")}</span>
          </ContextMenuItem>
        </ContextMenuContent>
      ) : null}
    </ContextMenu>
  );
});
