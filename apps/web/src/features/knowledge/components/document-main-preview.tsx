/**
 * @file 资源主预览面板模块。
 */

import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";

import { Badge } from "@/components/ui/badge";
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from "@/components/ui/empty";
import { Button } from "@/components/ui/button";
import { getDocumentFileUrl } from "@/lib/api/document-file-url";
import type { KnowledgeDocument } from "../api/documents";
import { DocumentImagePreview } from "./document-image-preview";
import { DocumentPdfPreview } from "./document-pdf-preview";
import { DocumentTextPreview } from "./document-text-preview";
import { getDocumentPreviewKind } from "../api/document-preview";
import { documentTextPreviewQueryOptions } from "../api/documents-query";
import { formatFileSize } from "@/lib/utils";
import { formatDateTime, useDateLocale } from "@/lib/date-utils";
import { getDocumentTypeLabel } from "./resource-document-helpers";
import { openProtectedFile } from "./protected-file-actions";

type DocumentMainPreviewProps = {
  document: KnowledgeDocument | null;
  emptyState?: "no-match" | "selection-required";
};

export function DocumentMainPreview({
  document,
  emptyState = "no-match",
}: DocumentMainPreviewProps) {
  const { t } = useTranslation("knowledge");
  const dateLocale = useDateLocale();
  const previewKind = useMemo(
    () => (document ? getDocumentPreviewKind(document.file_type) : "unsupported"),
    [document],
  );

  const shouldLoadTextPreview =
    (previewKind === "markdown" || previewKind === "text") &&
    document?.ingest_status !== "processing" &&
    document?.ingest_status !== "uploaded" &&
    document?.ingest_status !== "failed";

  const textPreviewQuery = useQuery(
    documentTextPreviewQueryOptions(document, shouldLoadTextPreview),
  );

  if (!document) {
    const emptyTitleKey =
      emptyState === "selection-required" ? "selectionRequiredTitle" : "selectedResourceEmptyTitle";
    const emptyDescriptionKey =
      emptyState === "selection-required"
        ? "selectionRequiredDescription"
        : "selectedResourceEmptyDescription";

    return (
      <section className="surface-panel-subtle flex h-full min-h-80 min-w-0 flex-col justify-center rounded-3xl border border-border/60 p-6">
        <Empty className="bg-transparent">
          <EmptyHeader>
            <EmptyTitle>{t(emptyTitleKey)}</EmptyTitle>
            <EmptyDescription>{t(emptyDescriptionKey)}</EmptyDescription>
          </EmptyHeader>
        </Empty>
      </section>
    );
  }

  const shouldShowProcessing =
    document.ingest_status === "processing" || document.ingest_status === "uploaded";
  const shouldShowFailed = document.ingest_status === "failed";
  const metaItems = [
    formatFileSize(document.file_size),
    formatDateTime(document.updated_at, dateLocale) || document.updated_at,
    typeof document.chunk_count === "number" ? `${document.chunk_count} chunks` : null,
  ].filter(Boolean);

  return (
    <section className="surface-panel-subtle flex h-full min-h-[20rem] min-w-0 flex-col overflow-hidden rounded-3xl border border-border/60">
      <div className="border-b border-border/60 p-5">
        <div className="space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="outline">{getDocumentTypeLabel(previewKind, t)}</Badge>
            <Badge variant="secondary">
              {t("versionValue", { version: document.revision_no })}
            </Badge>
            <Badge variant={shouldShowFailed ? "destructive" : "outline"}>
              {t(
                `status${document.ingest_status.charAt(0).toUpperCase()}${document.ingest_status.slice(1)}`,
              )}
            </Badge>
          </div>
          <div className="space-y-1">
            <h2 className="break-words text-xl font-semibold tracking-tight text-foreground">
              {document.name}
            </h2>
            <p className="break-all text-sm text-muted-foreground">
              {document.logical_name || t("rowLogicalNameFallback")}
            </p>
          </div>
          {metaItems.length > 0 ? (
            <p className="text-xs leading-5 text-muted-foreground">{metaItems.join(" · ")}</p>
          ) : null}
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-auto p-5">
        {shouldShowProcessing ? (
          <div className="surface-light rounded-2xl p-4 text-sm text-muted-foreground">
            {t("previewProcessingDescription")}
          </div>
        ) : shouldShowFailed ? (
          <div className="space-y-2 rounded-2xl border border-destructive/30 bg-destructive/8 p-4">
            <p className="text-sm font-medium text-foreground">{t("previewFailedTitle")}</p>
            <p className="text-sm text-muted-foreground">
              {document.error_message || t("previewFailedDescription")}
            </p>
          </div>
        ) : previewKind === "image" ? (
          <DocumentImagePreview document={document} />
        ) : previewKind === "markdown" || previewKind === "text" ? (
          textPreviewQuery.isPending ? (
            <div className="surface-light rounded-2xl p-4 text-sm text-muted-foreground">
              {t("previewLoading")}
            </div>
          ) : textPreviewQuery.isError ? (
            <div className="surface-light rounded-2xl p-4 text-sm text-muted-foreground">
              {t("previewLoadFailed")}
            </div>
          ) : textPreviewQuery.data?.kind === "too-large" ? (
            <div className="surface-light rounded-2xl p-4 text-sm text-muted-foreground">
              {t("previewTooLargeDescription")}
            </div>
          ) : textPreviewQuery.data?.kind === "text" ? (
            <DocumentTextPreview
              content={textPreviewQuery.data.content}
              mode={previewKind === "markdown" ? "markdown" : "text"}
            />
          ) : null
        ) : previewKind === "pdf" ? (
          <DocumentPdfPreview document={document} />
        ) : (
          <div className="surface-light space-y-3 rounded-2xl p-4">
            <p className="text-sm font-medium text-foreground">{t("previewUnsupportedTitle")}</p>
            <p className="text-sm text-muted-foreground">{t("previewUnsupportedDescription")}</p>
            <Button
              onClick={() => openProtectedFile(getDocumentFileUrl(document.id))}
              type="button"
              variant="outline"
            >
              {t("openOriginalAction")}
            </Button>
          </div>
        )}
      </div>
    </section>
  );
}
