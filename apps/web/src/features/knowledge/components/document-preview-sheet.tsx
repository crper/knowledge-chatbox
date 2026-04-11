/**
 * @file 资源预览抽屉组件模块。
 */

import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { Link } from "@/lib/app-router";
import { queryKeys } from "@/lib/api/query-keys";

import { getDocumentFileUrl } from "@/features/chat/utils/document-file-url";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import type { KnowledgeDocument } from "../api/documents";
import { getDocumentPreviewKind, loadDocumentTextPreview } from "../api/document-preview";
import { cn } from "@/lib/utils";
import { formatDateTime } from "@/lib/date-utils";
import { DocumentImagePreview } from "./document-image-preview";
import { DocumentPdfPreview } from "./document-pdf-preview";
import { DocumentTextPreview } from "./document-text-preview";
import { formatFileSize, getDocumentTypeLabel } from "./resource-document-helpers";
import { openProtectedFile, downloadProtectedFile } from "./protected-file-actions";

type DocumentPreviewSheetProps = {
  document: KnowledgeDocument | null;
  onDelete: (document: KnowledgeDocument) => void;
  onOpenChange: (open: boolean) => void;
  onReindex: (document: KnowledgeDocument) => void;
  onShowVersions: (documentId: number) => void;
  open: boolean;
};

/**
 * 渲染资源预览抽屉。
 */
export function DocumentPreviewSheet({
  document,
  onDelete,
  onOpenChange,
  onReindex,
  onShowVersions,
  open,
}: DocumentPreviewSheetProps) {
  const { i18n, t } = useTranslation("knowledge");

  const previewKind = useMemo(
    () => (document ? getDocumentPreviewKind(document.file_type) : "unsupported"),
    [document],
  );
  const shouldShowProcessing = document?.status === "processing" || document?.status === "uploaded";
  const shouldShowFailed = document?.status === "failed";
  const shouldLoadTextPreview =
    open &&
    document !== null &&
    !shouldShowProcessing &&
    !shouldShowFailed &&
    (previewKind === "markdown" || previewKind === "text");

  const previewQuery = useQuery({
    queryKey: queryKeys.documents.preview(document?.id, document?.updated_at),
    queryFn: () => loadDocumentTextPreview(document!),
    enabled: shouldLoadTextPreview,
  });

  if (!document) {
    return null;
  }

  const fileUrl = getDocumentFileUrl(document.id);
  const metaItems = [
    formatFileSize(document.file_size),
    formatDateTime(document.updated_at, i18n.resolvedLanguage ?? "zh-CN") || document.updated_at,
    typeof document.chunk_count === "number" ? `${document.chunk_count} chunks` : null,
  ].filter(Boolean);

  return (
    <Sheet onOpenChange={onOpenChange} open={open}>
      <SheetContent
        className="w-full max-w-[35rem] gap-0 p-0 sm:max-w-[35rem]"
        closeLabel={t("closeAction")}
        overlayProps={{ onClick: () => onOpenChange(false) }}
        side="right"
      >
        <SheetHeader className="border-b border-border/70">
          <SheetTitle>{t("previewTitle")}</SheetTitle>
          <SheetDescription>{t("previewDescription")}</SheetDescription>
        </SheetHeader>

        <div className="flex min-h-0 flex-1 flex-col">
          <div className="space-y-4 border-b border-border/70 p-4">
            <div className="surface-light space-y-2 rounded-xl p-4">
              <p className="break-words text-base font-semibold text-foreground">{document.name}</p>
              <div className="flex flex-wrap gap-2">
                <Badge variant="outline">{getDocumentTypeLabel(previewKind, t)}</Badge>
                <Badge variant="secondary">
                  {t("versionValue", { version: document.version })}
                </Badge>
                <Badge variant={document.status === "failed" ? "destructive" : "outline"}>
                  {t(`status${document.status.charAt(0).toUpperCase()}${document.status.slice(1)}`)}
                </Badge>
              </div>
              {metaItems.length > 0 ? (
                <p className="text-xs leading-5 text-muted-foreground">{metaItems.join(" · ")}</p>
              ) : null}
            </div>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto p-4 pt-0">
            {shouldShowProcessing ? (
              <div className="surface-light mt-4 rounded-xl p-4 text-sm text-muted-foreground">
                {t("previewProcessingDescription")}
              </div>
            ) : shouldShowFailed ? (
              <div className="mt-4 space-y-2 rounded-xl border border-destructive/30 bg-destructive/8 p-4">
                <p className="text-sm font-medium text-foreground">{t("previewFailedTitle")}</p>
                <p className="text-sm text-muted-foreground">
                  {document.error_message || t("previewFailedDescription")}
                </p>
              </div>
            ) : previewKind === "image" ? (
              <div className="mt-4">
                <DocumentImagePreview document={document} />
              </div>
            ) : previewKind === "markdown" || previewKind === "text" ? (
              <div className="mt-4">
                {previewQuery.isPending ? (
                  <div className="surface-light rounded-xl p-4 text-sm text-muted-foreground">
                    {t("previewLoading")}
                  </div>
                ) : previewQuery.isError ? (
                  <div className="surface-light rounded-xl p-4 text-sm text-muted-foreground">
                    {t("previewLoadFailed")}
                  </div>
                ) : previewQuery.data?.kind === "too-large" ? (
                  <div className="surface-light rounded-xl p-4 text-sm text-muted-foreground">
                    {t("previewTooLargeDescription")}
                  </div>
                ) : previewQuery.data?.kind === "text" ? (
                  <DocumentTextPreview
                    content={previewQuery.data.content}
                    mode={previewKind === "markdown" ? "markdown" : "text"}
                  />
                ) : null}
              </div>
            ) : previewKind === "pdf" ? (
              <div className="mt-4">
                <DocumentPdfPreview compact document={document} />
              </div>
            ) : (
              <div className="surface-light mt-4 space-y-2 rounded-xl p-4">
                <p className="text-sm font-medium text-foreground">
                  {t("previewUnsupportedTitle")}
                </p>
                <p className="text-sm text-muted-foreground">
                  {t("previewUnsupportedDescription")}
                </p>
              </div>
            )}
          </div>

          <SheetFooter className="sticky bottom-0 border-t border-border/70 bg-background/96">
            <div className="flex w-full flex-col gap-2">
              <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
                <Link className={cn(buttonVariants({ variant: "outline" }))} to="/chat">
                  {t("openChatAction")}
                </Link>
                <Button
                  onClick={() => onShowVersions(document.document_id)}
                  type="button"
                  variant="outline"
                >
                  {t("viewVersionsAction")}
                </Button>
                <Button onClick={() => openProtectedFile(fileUrl)} type="button" variant="outline">
                  {t("openOriginalAction")}
                </Button>
                <Button
                  onClick={() => downloadProtectedFile(fileUrl, document.name)}
                  type="button"
                  variant="outline"
                >
                  {t("downloadOriginalAction")}
                </Button>
              </div>
              <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
                <Button onClick={() => onReindex(document)} type="button" variant="outline">
                  {t("reindexAction")}
                </Button>
                <Button onClick={() => onDelete(document)} type="button" variant="ghost">
                  {t("deleteAction")}
                </Button>
              </div>
            </div>
          </SheetFooter>
        </div>
      </SheetContent>
    </Sheet>
  );
}
