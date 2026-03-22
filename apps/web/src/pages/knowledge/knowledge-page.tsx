/**
 * @file 资源页面模块。
 */

import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { FilesIcon, ScanSearchIcon, SearchIcon, UploadIcon } from "lucide-react";

import { FileDropzone } from "@/components/upload/file-dropzone";
import { WorkspaceMetricCard, WorkspacePage } from "@/components/shared/workspace-page";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import type {
  KnowledgeDocument,
  KnowledgeDocumentStatus,
} from "@/features/knowledge/api/documents";
import { getDocumentPreviewKind } from "@/features/knowledge/api/document-preview";
import { DocumentPreviewSheet } from "@/features/knowledge/components/document-preview-sheet";
import { ResourceDocumentList } from "@/features/knowledge/components/resource-document-list";
import { SelectedResourceBand } from "@/features/knowledge/components/selected-resource-band";
import { UploadQueueSummary } from "@/features/knowledge/components/upload-queue-summary";
import { useKnowledgeWorkspace } from "@/features/knowledge/hooks/use-knowledge-workspace";
import { VersionDrawer } from "@/features/knowledge/components/version-drawer";
import { cn } from "@/lib/utils";

type ResourceTypeFilter = "all" | "document" | "image" | "markdown" | "pdf" | "text";

const TYPE_FILTER_VALUES: ResourceTypeFilter[] = [
  "all",
  "document",
  "image",
  "markdown",
  "pdf",
  "text",
];
const STATUS_FILTER_VALUES: Array<"all" | KnowledgeDocumentStatus> = [
  "all",
  "uploaded",
  "processing",
  "indexed",
  "failed",
];

/**
 * 渲染资源页面。
 */
export function KnowledgePage() {
  const { t } = useTranslation("knowledge");
  const [pendingDeleteDocument, setPendingDeleteDocument] = useState<KnowledgeDocument | null>(
    null,
  );
  const [searchValue, setSearchValue] = useState("");
  const [previewOpen, setPreviewOpen] = useState(false);
  const [selectedDocumentId, setSelectedDocumentId] = useState<number | null>(null);
  const [typeFilter, setTypeFilter] = useState<ResourceTypeFilter>("all");
  const [statusFilter, setStatusFilter] = useState<"all" | KnowledgeDocumentStatus>("all");
  const {
    canManageDocuments,
    cancelUpload,
    closeVersionDrawer,
    deleteDocument,
    documents,
    enqueueUploads,
    localUploadingCount,
    processingCount,
    rejectFiles,
    removeUpload,
    reindexDocument,
    retryUpload,
    showVersions,
    uploadItems,
    versionDrawerOpen,
    versions,
  } = useKnowledgeWorkspace();
  const filteredDocuments = useMemo(() => {
    const normalizedQuery = searchValue.trim().toLowerCase();
    return documents.filter((document) => {
      const matchesQuery =
        normalizedQuery.length === 0 ||
        [document.name, document.logical_name ?? "", document.file_type, document.status].some(
          (value) => value.toLowerCase().includes(normalizedQuery),
        );

      const previewKind = getDocumentPreviewKind(document.file_type);
      const normalizedTypeFilter =
        previewKind === "unsupported" || previewKind === "docx" ? "document" : previewKind;
      const matchesType = typeFilter === "all" || normalizedTypeFilter === typeFilter;
      const matchesStatus = statusFilter === "all" || document.status === statusFilter;

      return matchesQuery && matchesType && matchesStatus;
    });
  }, [documents, searchValue, statusFilter, typeFilter]);
  const indexedCount = documents.filter((document) => document.status === "indexed").length;
  const hasDocuments = documents.length > 0;
  const selectedDocument = useMemo(
    () => documents.find((document) => document.id === selectedDocumentId) ?? null,
    [documents, selectedDocumentId],
  );

  useEffect(() => {
    if (selectedDocumentId === null) {
      return;
    }

    const hasSelectedDocument = filteredDocuments.some(
      (document) => document.id === selectedDocumentId,
    );
    if (hasSelectedDocument) {
      return;
    }

    setPreviewOpen(false);
    setSelectedDocumentId(null);
  }, [filteredDocuments, selectedDocumentId]);

  return (
    <>
      <WorkspacePage
        actions={
          <div className="flex w-full flex-wrap items-center gap-3 md:justify-end">
            <label className="relative min-w-[min(18rem,100%)] flex-1 basis-[18rem]">
              <SearchIcon className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                aria-label={t("searchInputLabel")}
                className="h-11 rounded-[1.15rem] border-border/60 bg-background/68 pl-9"
                onChange={(event) => setSearchValue(event.target.value)}
                placeholder={t("searchInputPlaceholder")}
                value={searchValue}
              />
            </label>
            {canManageDocuments ? (
              <FileDropzone onFilesAccepted={enqueueUploads} onFilesRejected={rejectFiles}>
                {({
                  getInputProps,
                  getRootProps,
                  isDragAccept,
                  isDragActive,
                  isDragReject,
                  open,
                }) => (
                  <div
                    {...getRootProps({
                      className: cn(
                        "rounded-[1.15rem] transition-transform",
                        isDragAccept && "scale-[1.01]",
                        isDragReject && "scale-[0.99]",
                      ),
                    })}
                  >
                    <input {...getInputProps({ "aria-label": t("uploadAction") })} />
                    <Button
                      className={cn(
                        "min-w-[8.75rem]",
                        isDragAccept && "border-primary/24 bg-primary/90 text-primary-foreground",
                        isDragReject && "border-destructive/24 bg-destructive/12 text-destructive",
                        isDragActive && "shadow-[0_14px_28px_-18px_hsl(var(--primary)/0.44)]",
                      )}
                      onClick={open}
                      type="button"
                      variant={isDragReject ? "destructive" : "default"}
                    >
                      {localUploadingCount > 0 ? (
                        <Spinner aria-hidden="true" data-icon="inline-start" />
                      ) : (
                        <UploadIcon aria-hidden="true" data-icon="inline-start" />
                      )}
                      {localUploadingCount > 0 ? t("uploadPendingAction") : t("uploadAction")}
                    </Button>
                  </div>
                )}
              </FileDropzone>
            ) : null}
          </div>
        }
        badge={t("workspaceBadge")}
        className="h-full min-h-0 xl:mx-0"
        description={t("pageDescription")}
        dataTestId="knowledge-page-layout"
        headerClassName="gap-4"
        layoutClassName="min-h-0 flex-1"
        metrics={
          <>
            <WorkspaceMetricCard
              icon={FilesIcon}
              label={t("summaryTotalLabel")}
              value={t("summaryTotalValue", { count: documents.length })}
            />
            <WorkspaceMetricCard
              detail={localUploadingCount > 0 ? t("uploadPendingAction") : undefined}
              icon={UploadIcon}
              label={t("summaryProcessingLabel")}
              value={t("summaryProcessingValue", { count: processingCount })}
            />
            <WorkspaceMetricCard
              icon={ScanSearchIcon}
              label={t("summaryIndexedLabel")}
              value={t("summaryIndexedValue", { count: indexedCount })}
            />
          </>
        }
        metricsClassName="xl:grid-cols-[minmax(0,1.15fr)_repeat(2,minmax(0,1fr))]"
        main={
          <div
            className="flex h-full min-h-0 flex-col gap-4"
            data-surface-style="flat"
            data-testid="knowledge-main-surface"
          >
            <div className="flex min-h-0 flex-1 flex-col gap-4 xl:pr-2">
              {uploadItems.length > 0 ? (
                <UploadQueueSummary
                  items={uploadItems}
                  onCancel={cancelUpload}
                  onRemove={removeUpload}
                  onRetry={retryUpload}
                />
              ) : null}
              {hasDocuments ? (
                <section className="surface-panel-subtle space-y-3 rounded-[1.35rem] p-3.5 md:p-4">
                  <div className="flex flex-col gap-2.5 md:flex-row md:items-start md:justify-between">
                    <div className="space-y-1.5">
                      <p className="text-ui-title">{t("tableSectionTitle")}</p>
                      <p className="text-ui-subtle text-muted-foreground">
                        {t("tableSectionDescription")}
                      </p>
                    </div>
                    <Badge className="rounded-full px-3 py-1" variant="outline">
                      {t("resultCount", { count: filteredDocuments.length })}
                    </Badge>
                  </div>

                  {processingCount > 0 ? (
                    <div className="surface-outline rounded-[0.95rem] px-3 py-2">
                      <p className="text-ui-subtle text-muted-foreground">
                        {t("processingInlineHint")}
                      </p>
                    </div>
                  ) : null}

                  <div className="flex flex-wrap gap-2">
                    {TYPE_FILTER_VALUES.map((value) => (
                      <Button
                        key={value}
                        onClick={() => setTypeFilter(value)}
                        size="sm"
                        type="button"
                        variant={typeFilter === value ? "default" : "outline"}
                      >
                        {t(`typeFilter${value.charAt(0).toUpperCase()}${value.slice(1)}`)}
                      </Button>
                    ))}
                    {STATUS_FILTER_VALUES.map((value) => (
                      <Button
                        key={value}
                        onClick={() => setStatusFilter(value)}
                        size="sm"
                        type="button"
                        variant={statusFilter === value ? "secondary" : "ghost"}
                      >
                        {value === "all"
                          ? t("statusFilterAll")
                          : t(`status${value.charAt(0).toUpperCase()}${value.slice(1)}`)}
                      </Button>
                    ))}
                  </div>
                </section>
              ) : null}
              {!hasDocuments ? (
                canManageDocuments ? (
                  <FileDropzone onFilesAccepted={enqueueUploads} onFilesRejected={rejectFiles}>
                    {({
                      getInputProps,
                      getRootProps,
                      isDragAccept,
                      isDragActive,
                      isDragReject,
                      open,
                    }) => (
                      <Empty
                        {...getRootProps({
                          className: cn(
                            "min-h-[20rem] select-none rounded-[1.75rem] border border-dashed border-border/70 bg-[radial-gradient(circle_at_top,hsl(var(--primary)/0.08),transparent_36%),linear-gradient(180deg,hsl(var(--background)/0.72),hsl(var(--muted)/0.34))] px-6 py-8 transition-colors",
                            isDragAccept && "border-primary/45 bg-primary/6",
                            isDragReject && "border-destructive/45 bg-destructive/8",
                          ),
                        })}
                      >
                        <input {...getInputProps({ "aria-label": t("uploadAction") })} />
                        <EmptyHeader className="max-w-xl gap-3">
                          <Badge
                            className="text-ui-kicker rounded-full px-3 py-1"
                            variant="outline"
                          >
                            {t("emptyOnboardingFlowBadge")}
                          </Badge>
                          <EmptyMedia
                            className="surface-icon size-12 rounded-2xl text-primary [&_svg]:size-5"
                            variant="icon"
                          >
                            <UploadIcon aria-hidden="true" />
                          </EmptyMedia>
                          <EmptyTitle aria-level={2} className="text-ui-heading" role="heading">
                            {t("emptyOnboardingTitle")}
                          </EmptyTitle>
                          <EmptyDescription className="text-ui-body measure-readable max-w-xl">
                            {t("emptyOnboardingDescription")}
                          </EmptyDescription>
                        </EmptyHeader>
                        <EmptyContent className="max-w-xl gap-4">
                          <div className="grid w-full gap-2 text-left">
                            <div className="surface-outline text-ui-subtle select-none rounded-2xl px-4 py-3 text-muted-foreground">
                              {t("emptyOnboardingStepOne")}
                            </div>
                            <div className="surface-outline text-ui-subtle select-none rounded-2xl px-4 py-3 text-muted-foreground">
                              {t("emptyOnboardingStepTwo")}
                            </div>
                          </div>
                          <div className="surface-outline select-none rounded-2xl border-dashed px-4 py-3 text-left">
                            <p className="text-sm font-medium text-foreground">
                              {t("dropzoneTitle")}
                            </p>
                            <p
                              className={cn(
                                "mt-1 text-xs text-muted-foreground",
                                isDragReject && "text-destructive",
                                isDragAccept && "text-primary",
                              )}
                            >
                              {isDragReject
                                ? t("dropzoneRejectHint")
                                : isDragActive
                                  ? t("dropzoneActiveHint")
                                  : t("dropzoneHint")}
                            </p>
                          </div>
                          <Button onClick={open} type="button">
                            <UploadIcon data-icon="inline-start" />
                            {t("uploadAction")}
                          </Button>
                        </EmptyContent>
                      </Empty>
                    )}
                  </FileDropzone>
                ) : (
                  <Empty className="min-h-[20rem] rounded-[1.75rem] border border-dashed border-border/70 bg-[radial-gradient(circle_at_top,hsl(var(--primary)/0.08),transparent_36%),linear-gradient(180deg,hsl(var(--background)/0.72),hsl(var(--muted)/0.34))] px-6 py-8">
                    <EmptyHeader className="max-w-xl gap-3">
                      <Badge className="text-ui-kicker rounded-full px-3 py-1" variant="outline">
                        {t("emptyReadonlyFlowBadge")}
                      </Badge>
                      <EmptyMedia
                        className="surface-icon size-12 rounded-2xl text-primary [&_svg]:size-5"
                        variant="icon"
                      >
                        <UploadIcon aria-hidden="true" />
                      </EmptyMedia>
                      <EmptyTitle aria-level={2} className="text-ui-heading" role="heading">
                        {t("emptyReadonlyTitle")}
                      </EmptyTitle>
                      <EmptyDescription className="text-ui-body measure-readable max-w-xl">
                        {t("emptyReadonlyDescription")}
                      </EmptyDescription>
                    </EmptyHeader>
                  </Empty>
                )
              ) : (
                <>
                  <ResourceDocumentList
                    canDelete={canManageDocuments}
                    className="min-h-0 flex-1 basis-[17rem]"
                    documents={filteredDocuments}
                    onDelete={setPendingDeleteDocument}
                    onPreviewDocument={(document) => {
                      setSelectedDocumentId(document.id);
                      setPreviewOpen(true);
                    }}
                    onReindex={(document) => void reindexDocument(document.document_id)}
                    onSelectDocument={(document) => setSelectedDocumentId(document.id)}
                    onShowVersions={(documentId) => void showVersions(documentId)}
                    selectedDocumentId={selectedDocumentId}
                  />
                  <SelectedResourceBand
                    document={selectedDocument}
                    onPreviewDocument={(document) => {
                      setSelectedDocumentId(document.id);
                      setPreviewOpen(true);
                    }}
                    onShowVersions={(documentId) => void showVersions(documentId)}
                  />
                </>
              )}
            </div>
          </div>
        }
        surface="flat"
        title={t("pageTitle")}
        width="wide"
      />

      <DocumentPreviewSheet
        document={selectedDocument}
        onDelete={setPendingDeleteDocument}
        onOpenChange={setPreviewOpen}
        onReindex={(document) => void reindexDocument(document.document_id)}
        onShowVersions={(documentId) => void showVersions(documentId)}
        open={previewOpen && selectedDocument !== null}
      />

      <VersionDrawer onClose={closeVersionDrawer} open={versionDrawerOpen} versions={versions} />

      <AlertDialog
        onOpenChange={(nextOpen) => !nextOpen && setPendingDeleteDocument(null)}
        open={pendingDeleteDocument !== null}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("deleteDialogTitle")}</AlertDialogTitle>
            <AlertDialogDescription>
              {t("deleteDialogDescription", { name: pendingDeleteDocument?.name ?? "" })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("cancelAction")}</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (!pendingDeleteDocument) {
                  return;
                }

                void deleteDocument(pendingDeleteDocument.document_id);
                setPendingDeleteDocument(null);
              }}
              variant="destructive"
            >
              {t("confirmDeleteAction")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
