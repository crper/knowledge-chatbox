/**
 * @file 资源主预览面板模块。
 */

import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";

import { Badge } from "@/components/ui/badge";
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from "@/components/ui/empty";
import { Button } from "@/components/ui/button";
import { getDocumentFileUrl } from "@/features/chat/utils/document-file-url";
import { fetchProtectedFileBlob } from "@/lib/api/protected-file";
import type { KnowledgeDocument } from "../api/documents";
import { DocumentImagePreview } from "./document-image-preview";
import { DocumentTextPreview } from "./document-text-preview";
import { getDocumentPreviewKind, loadDocumentTextPreview } from "../api/document-preview";
import { formatDateTime } from "@/lib/date-utils";
import { formatFileSize, getDocumentTypeLabel } from "./resource-document-helpers";
import { openProtectedFile } from "./protected-file-actions";

type DocumentMainPreviewProps = {
  document: KnowledgeDocument | null;
  emptyState?: "no-match" | "selection-required";
};

export function DocumentMainPreview({
  document,
  emptyState = "no-match",
}: DocumentMainPreviewProps) {
  const { i18n, t } = useTranslation("knowledge");
  const [pdfUrl, setPdfUrl] = useState<string | null>(null);
  const [pdfLoadFailed, setPdfLoadFailed] = useState(false);
  const previewKind = useMemo(
    () => (document ? getDocumentPreviewKind(document.file_type) : "unsupported"),
    [document],
  );

  const textPreviewQuery = useQuery({
    queryKey: ["knowledge", "document-main-preview", document?.id, document?.updated_at],
    queryFn: () => loadDocumentTextPreview(document!),
    enabled:
      document !== null &&
      (previewKind === "markdown" || previewKind === "text") &&
      document.status !== "processing" &&
      document.status !== "uploaded" &&
      document.status !== "failed",
  });

  useEffect(() => {
    if (!document || previewKind !== "pdf" || document.status === "failed") {
      setPdfUrl(null);
      setPdfLoadFailed(false);
      return;
    }

    let disposed = false;
    let objectUrl: string | null = null;

    setPdfUrl(null);
    setPdfLoadFailed(false);

    void fetchProtectedFileBlob(getDocumentFileUrl(document.id))
      .then((blob) => {
        if (disposed) {
          return;
        }

        objectUrl = URL.createObjectURL(blob);
        setPdfUrl(objectUrl);
      })
      .catch(() => {
        if (!disposed) {
          setPdfLoadFailed(true);
        }
      });

    return () => {
      disposed = true;
      if (objectUrl) {
        URL.revokeObjectURL(objectUrl);
      }
    };
  }, [document, previewKind]);

  if (!document) {
    const emptyTitleKey =
      emptyState === "selection-required" ? "selectionRequiredTitle" : "selectedResourceEmptyTitle";
    const emptyDescriptionKey =
      emptyState === "selection-required"
        ? "selectionRequiredDescription"
        : "selectedResourceEmptyDescription";

    return (
      <section className="surface-panel-subtle flex h-full min-h-[20rem] min-w-0 flex-col justify-center rounded-3xl border border-border/60 p-6">
        <Empty className="bg-transparent">
          <EmptyHeader>
            <EmptyTitle>{t(emptyTitleKey)}</EmptyTitle>
            <EmptyDescription>{t(emptyDescriptionKey)}</EmptyDescription>
          </EmptyHeader>
        </Empty>
      </section>
    );
  }

  const shouldShowProcessing = document.status === "processing" || document.status === "uploaded";
  const shouldShowFailed = document.status === "failed";
  const metaItems = [
    formatFileSize(document.file_size),
    formatDateTime(document.updated_at, i18n.resolvedLanguage ?? "zh-CN") || document.updated_at,
    typeof document.chunk_count === "number" ? `${document.chunk_count} chunks` : null,
  ].filter(Boolean);

  return (
    <section className="surface-panel-subtle flex h-full min-h-[20rem] min-w-0 flex-col overflow-hidden rounded-3xl border border-border/60">
      <div className="border-b border-border/60 p-5">
        <div className="space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="outline">{getDocumentTypeLabel(previewKind, t)}</Badge>
            <Badge variant="secondary">{t("versionValue", { version: document.version })}</Badge>
            <Badge variant={shouldShowFailed ? "destructive" : "outline"}>
              {t(`status${document.status.charAt(0).toUpperCase()}${document.status.slice(1)}`)}
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
          pdfLoadFailed ? (
            <div className="surface-light rounded-2xl p-4 text-sm text-muted-foreground">
              {t("previewLoadFailed")}
            </div>
          ) : pdfUrl ? (
            <iframe
              className="min-h-[60vh] w-full rounded-2xl border border-border/60 bg-background"
              src={pdfUrl}
              title={document.name}
            />
          ) : (
            <div className="surface-light rounded-2xl p-4 text-sm text-muted-foreground">
              {t("previewLoading")}
            </div>
          )
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
