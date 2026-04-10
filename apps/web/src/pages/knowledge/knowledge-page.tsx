/**
 * @file 资源页面模块。
 */

import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { FilesIcon, ScanSearchIcon, UploadIcon } from "lucide-react";

import { FileDropzone } from "@/components/upload/file-dropzone";
import { useNavigate } from "@/lib/app-router";
import { WorkspaceMetricCard, WorkspacePage } from "@/components/shared/workspace-page";
import { Alert, AlertAction, AlertDescription, AlertTitle } from "@/components/ui/alert";
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
import { Spinner } from "@/components/ui/spinner";
import { WorkbenchLayout } from "@/layouts/workbench-layout";
import type {
  KnowledgeDocument,
  KnowledgeDocumentStatus,
} from "@/features/knowledge/api/documents";
import { KNOWLEDGE_DOCUMENT_STATUSES } from "@/features/knowledge/api/documents";
import { DocumentInspectorPanel } from "@/features/knowledge/components/document-inspector-panel";
import type { DocumentInspectorTabValue } from "@/features/knowledge/components/document-inspector-panel";
import { DocumentMainPreview } from "@/features/knowledge/components/document-main-preview";
import { DocumentPreviewSheet } from "@/features/knowledge/components/document-preview-sheet";
import { ResourceDocumentList } from "@/features/knowledge/components/resource-document-list";
import { ResourceWorkbenchToolbar } from "@/features/knowledge/components/resource-workbench-toolbar";
import { KNOWLEDGE_TYPE_FILTER_VALUES } from "@/features/knowledge/route-search";
import { UploadQueueSummary } from "@/features/knowledge/components/upload-queue-summary";
import { useKnowledgeSearch } from "@/features/knowledge/hooks/use-knowledge-search";
import { useKnowledgeWorkspace } from "@/features/knowledge/hooks/use-knowledge-workspace";
import { VersionDrawer } from "@/features/knowledge/components/version-drawer";
import { useIsMobile } from "@/lib/hooks/use-mobile";
import { buildSettingsPath } from "@/lib/routes";
import { cn } from "@/lib/utils";

type ResourceTypeFilter = "all" | (typeof KNOWLEDGE_TYPE_FILTER_VALUES)[number];

const TYPE_FILTER_VALUES: ResourceTypeFilter[] = ["all", ...KNOWLEDGE_TYPE_FILTER_VALUES];
const STATUS_FILTER_VALUES: Array<"all" | KnowledgeDocumentStatus> = [
  "all",
  ...KNOWLEDGE_DOCUMENT_STATUSES,
];

function getTypeFilterLabel(value: ResourceTypeFilter, t: (key: string) => string) {
  return t(`typeFilter${value.charAt(0).toUpperCase()}${value.slice(1)}`);
}

function getStatusFilterLabel(value: "all" | KnowledgeDocumentStatus, t: (key: string) => string) {
  return value === "all"
    ? t("statusFilterAll")
    : t(`status${value.charAt(0).toUpperCase()}${value.slice(1)}`);
}

function resolveSelectedResourceEmptyState(hasDocuments: boolean, hasActiveFilters: boolean) {
  if (hasDocuments) {
    return "selection-required" as const;
  }

  if (hasActiveFilters) {
    return "no-match" as const;
  }

  return "selection-required" as const;
}

/**
 * 渲染资源页面。
 */
export function KnowledgePage() {
  const { t } = useTranslation("knowledge");
  const isMobile = useIsMobile();
  const navigate = useNavigate();
  const [pendingDeleteDocument, setPendingDeleteDocument] = useState<KnowledgeDocument | null>(
    null,
  );
  const { deferredSearchValue, routeSearch, searchValue, setSearchValue, updateRouteSearch } =
    useKnowledgeSearch();
  const [previewOpen, setPreviewOpen] = useState(false);
  const [selectedDocumentId, setSelectedDocumentId] = useState<number | null>(null);
  const [inspectorTab, setInspectorTab] = useState<DocumentInspectorTabValue>("details");
  const hadDocumentsRef = useRef(false);
  const [filterTransitioning, setFilterTransitioning] = useState(false);
  const typeFilter = (routeSearch.type ?? "all") as ResourceTypeFilter;
  const statusFilter = (routeSearch.status ?? "all") as "all" | KnowledgeDocumentStatus;
  const documentFilters = useMemo(() => routeSearch, [routeSearch]);
  const {
    canManageDocuments,
    canManageProviderSettings,
    cancelUpload,
    closeVersionDrawer,
    deleteDocument,
    documents,
    documentsUpdatedAt,
    enqueueUploads,
    localUploadingCount,
    processingCount,
    rejectFiles,
    removeUpload,
    reindexDocument,
    retryUpload,
    showVersions,
    uploadReadiness,
    uploadReadinessPending,
    uploadItems,
    versionDrawerOpen,
    versions,
  } = useKnowledgeWorkspace(documentFilters);
  const indexedCount = useMemo(
    () => documents.filter((document) => document.status === "indexed").length,
    [documents],
  );
  const hasDocuments = documents.length > 0;
  const hasSearchQuery = deferredSearchValue.trim().length > 0;
  const activeFilterCount =
    Number(hasSearchQuery) + Number(typeFilter !== "all") + Number(statusFilter !== "all");
  const hasActiveFilters = activeFilterCount > 0;
  const selectedResourceEmptyState = resolveSelectedResourceEmptyState(
    hasDocuments,
    hasActiveFilters,
  );
  const selectedDocument = useMemo(
    () => documents.find((document) => document.id === selectedDocumentId) ?? null,
    [documents, selectedDocumentId],
  );
  const activeFilterBadges = [
    typeFilter === "all" ? null : getTypeFilterLabel(typeFilter, t),
    statusFilter === "all" ? null : getStatusFilterLabel(statusFilter, t),
  ].filter(Boolean) as string[];
  const uploadReadinessChecking = uploadReadinessPending && uploadReadiness === undefined;
  const uploadBlocked = uploadReadiness?.can_upload === false;
  const imageUploadFallback = !uploadBlocked && uploadReadiness?.image_fallback === true;

  useEffect(() => {
    if (selectedDocumentId === null) {
      return;
    }

    const hasSelectedDocument = documents.some((document) => document.id === selectedDocumentId);
    if (hasSelectedDocument) {
      return;
    }

    setPreviewOpen(false);
    setSelectedDocumentId(null);
    setInspectorTab("details");
  }, [documents, selectedDocumentId]);

  useEffect(() => {
    if (documents.length > 0) {
      hadDocumentsRef.current = true;
    }
    setFilterTransitioning(false);
  }, [documents.length, documentsUpdatedAt]);

  useEffect(() => {
    if (isMobile || selectedDocumentId !== null || documents.length === 0) {
      return;
    }

    setInspectorTab("details");
    setSelectedDocumentId(documents[0]?.id ?? null);
  }, [documents, isMobile, selectedDocumentId]);

  useEffect(() => {
    if (hadDocumentsRef.current) {
      setFilterTransitioning(true);
    }
  }, [documentFilters.query, documentFilters.status, documentFilters.type]);

  const openPreviewForDocument = (document: KnowledgeDocument) => {
    setInspectorTab("details");
    setSelectedDocumentId(document.id);
    if (isMobile) {
      setPreviewOpen(true);
    }
  };

  const handleSelectDocument = (document: KnowledgeDocument) => {
    setInspectorTab("details");
    setSelectedDocumentId(document.id);
    if (isMobile) {
      setPreviewOpen(true);
    }
  };

  const handleShowVersions = (documentId: number) => {
    const targetDocument =
      documents.find((document) => document.document_id === documentId) ?? null;
    if (targetDocument) {
      setSelectedDocumentId(targetDocument.id);
    }

    if (isMobile) {
      void showVersions(documentId);
      return;
    }

    setPreviewOpen(false);
    setInspectorTab("versions");
  };

  const clearFilters = () => {
    setSearchValue("");
    updateRouteSearch({
      query: undefined,
      status: undefined,
      type: undefined,
    });
  };

  const renderUploadReadinessAlert = () => {
    if (!canManageDocuments) {
      return null;
    }

    if (uploadReadinessChecking) {
      return (
        <Alert className="rounded-xl border-border/60 bg-background/60">
          <AlertTitle>{t("uploadCheckingTitle")}</AlertTitle>
          <AlertDescription>{t("uploadCheckingDescription")}</AlertDescription>
        </Alert>
      );
    }

    if (uploadBlocked) {
      return (
        <Alert className="rounded-xl border-destructive/30 bg-destructive/5" variant="destructive">
          <AlertTitle>{t("uploadBlockedTitle")}</AlertTitle>
          <AlertDescription>{t("uploadBlockedDescription")}</AlertDescription>
          {canManageProviderSettings ? (
            <AlertAction>
              <Button
                onClick={() => navigate(buildSettingsPath("providers"))}
                size="sm"
                type="button"
                variant="outline"
              >
                {t("uploadBlockedAction")}
              </Button>
            </AlertAction>
          ) : null}
        </Alert>
      );
    }

    if (imageUploadFallback) {
      return (
        <Alert className="rounded-xl border-border/60 bg-background/60">
          <AlertTitle>{t("uploadFallbackTitle")}</AlertTitle>
          <AlertDescription>{t("uploadFallbackDescription")}</AlertDescription>
        </Alert>
      );
    }

    return null;
  };

  const renderUploadAction = (fullWidth = false) => {
    if (!canManageDocuments) {
      return null;
    }

    return (
      <FileDropzone
        disabled={uploadBlocked}
        onFilesAccepted={enqueueUploads}
        onFilesRejected={rejectFiles}
      >
        {({ getInputProps, getRootProps, isDragAccept, isDragActive, isDragReject, open }) => (
          <div
            {...getRootProps({
              className: cn(
                "rounded-xl transition-transform",
                fullWidth && "flex-1",
                isDragAccept && "scale-[1.01]",
                isDragReject && "scale-[0.99]",
              ),
            })}
          >
            <input {...getInputProps({ "aria-label": t("uploadAction") })} />
            <Button
              className={cn(
                fullWidth ? "w-full" : "min-w-[8.75rem]",
                isDragAccept && "border-primary/24 bg-primary/90 text-primary-foreground",
                isDragReject && "border-destructive/24 bg-destructive/12 text-destructive",
                isDragActive && "shadow-[0_14px_28px_-18px_hsl(var(--primary)/0.44)]",
              )}
              disabled={uploadBlocked || uploadReadinessChecking}
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
    );
  };

  const desktopTypeFilterButtons = TYPE_FILTER_VALUES.map((value) => (
    <Button
      key={value}
      onClick={() => updateRouteSearch({ type: value === "all" ? undefined : value })}
      size="sm"
      type="button"
      variant={typeFilter === value ? "default" : "outline"}
    >
      {getTypeFilterLabel(value, t)}
    </Button>
  ));

  const desktopStatusFilterButtons = STATUS_FILTER_VALUES.map((value) => (
    <Button
      key={value}
      onClick={() => updateRouteSearch({ status: value === "all" ? undefined : value })}
      size="sm"
      type="button"
      variant={statusFilter === value ? "secondary" : "outline"}
    >
      {getStatusFilterLabel(value, t)}
    </Button>
  ));

  const resourcesSectionPane = (
    <div className="flex h-full min-h-0 flex-col gap-4">
      {renderUploadReadinessAlert()}
      {uploadItems.length > 0 ? (
        <UploadQueueSummary
          items={uploadItems}
          onCancel={cancelUpload}
          onRemove={removeUpload}
          onRetry={retryUpload}
        />
      ) : null}

      <ResourceWorkbenchToolbar
        activeFilterBadges={activeFilterBadges}
        activeFilterCount={activeFilterCount}
        clearFilters={clearFilters}
        isMobile={isMobile}
        renderUploadAction={renderUploadAction}
        searchValue={searchValue}
        setSearchValue={setSearchValue}
        statusFilterButtons={desktopStatusFilterButtons}
        typeFilterButtons={desktopTypeFilterButtons}
      />

      {processingCount > 0 ? (
        <div className="flex items-center gap-2 rounded-lg bg-primary/4 px-3 py-2 text-xs text-muted-foreground">
          <span className="relative flex size-2">
            <span className="absolute inline-flex size-2 animate-ping opacity-75 bg-primary/60" />
            <span className="relative inline-flex size-2 rounded-full bg-primary/80" />
          </span>
          {t("processingInlineHint")}
        </div>
      ) : null}

      {filterTransitioning ? (
        <div className="flex items-center gap-2 px-1 text-xs text-muted-foreground/70">
          <span className="size-1.5 animate-spin rounded-full border-2 border-current border-t-transparent" />
          <span>{t("searchRefreshingHint")}</span>
        </div>
      ) : null}

      <div className="min-h-0 flex-1 overflow-hidden">
        <ResourceDocumentList
          canDelete={canManageDocuments}
          className="h-full"
          documents={documents}
          onDelete={setPendingDeleteDocument}
          onPreviewDocument={openPreviewForDocument}
          onReindex={(document) => void reindexDocument(document.document_id)}
          onSelectDocument={handleSelectDocument}
          onShowVersions={handleShowVersions}
          selectedDocumentId={selectedDocumentId}
        />
      </div>
    </div>
  );

  const resourcesMainPane =
    !hasDocuments && !hasActiveFilters && !filterTransitioning ? (
      canManageDocuments ? (
        <FileDropzone
          disabled={uploadBlocked}
          onFilesAccepted={enqueueUploads}
          onFilesRejected={rejectFiles}
        >
          {({ getInputProps, getRootProps, isDragAccept, isDragActive, isDragReject, open }) => (
            <Empty
              {...getRootProps({
                className: cn(
                  "min-h-[24rem] select-none rounded-3xl border border-dashed border-border/70 bg-[radial-gradient(ellipse_56%_40%_at_top,hsl(var(--primary)/0.07),transparent_44%),linear-gradient(180deg,hsl(var(--background)/0.72),hsl(var(--muted)/0.34))] px-6 py-8 transition-[color,border-color,background,transform,box-shadow] duration-200 ease-out",
                  isDragAccept &&
                    "border-primary/46 bg-primary/6 scale-[1.005] shadow-[0_16px_36px_-20px_hsl(var(--primary)/0.18)]",
                  isDragReject && "border-destructive/46 bg-destructive/8 scale-[0.998]",
                ),
              })}
            >
              <input {...getInputProps({ "aria-label": t("uploadAction") })} />
              <EmptyHeader className="max-w-xl gap-3">
                <Badge className="text-ui-kicker rounded-full px-3 py-1" variant="outline">
                  {t("emptyOnboardingFlowBadge")}
                </Badge>
                <EmptyMedia
                  className="surface-light size-12 rounded-2xl text-primary [&_svg]:size-5"
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
                  <div className="surface-light text-ui-subtle select-none rounded-2xl px-4 py-3 text-muted-foreground">
                    {t("emptyOnboardingStepOne")}
                  </div>
                  <div className="surface-light text-ui-subtle select-none rounded-2xl px-4 py-3 text-muted-foreground">
                    {t("emptyOnboardingStepTwo")}
                  </div>
                </div>
                <div className="surface-light select-none rounded-2xl border-dashed px-4 py-3 text-left">
                  <p className="text-sm font-medium text-foreground">{t("dropzoneTitle")}</p>
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
                <Button
                  disabled={uploadBlocked || uploadReadinessChecking}
                  onClick={open}
                  type="button"
                >
                  <UploadIcon data-icon="inline-start" />
                  {t("uploadAction")}
                </Button>
              </EmptyContent>
            </Empty>
          )}
        </FileDropzone>
      ) : (
        <Empty className="min-h-[24rem] rounded-3xl border border-dashed border-border/70 bg-[radial-gradient(circle_at_top,hsl(var(--primary)/0.08),transparent_36%),linear-gradient(180deg,hsl(var(--background)/0.72),hsl(var(--muted)/0.34))] px-6 py-8">
          <EmptyHeader className="max-w-xl gap-3">
            <Badge className="text-ui-kicker rounded-full px-3 py-1" variant="outline">
              {t("emptyReadonlyFlowBadge")}
            </Badge>
            <EmptyMedia
              className="surface-light size-12 rounded-2xl text-primary [&_svg]:size-5"
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
      <DocumentMainPreview document={selectedDocument} emptyState={selectedResourceEmptyState} />
    );

  const resourcesInspectorPane = (
    <DocumentInspectorPanel
      activeTab={inspectorTab}
      document={selectedDocument}
      emptyState={selectedResourceEmptyState}
      onActiveTabChange={setInspectorTab}
      onDelete={setPendingDeleteDocument}
      onReindex={(document) => void reindexDocument(document.document_id)}
    />
  );

  return (
    <>
      <WorkspacePage
        badge={t("workspaceBadge")}
        className="h-full min-h-0 xl:mx-0"
        description={t("pageDescription")}
        dataTestId="knowledge-page-layout"
        headerClassName="gap-4"
        layoutClassName="min-h-0 flex-1"
        metrics={
          isMobile ? null : (
            <>
              <WorkspaceMetricCard
                icon={FilesIcon}
                label={t(hasActiveFilters ? "summaryCurrentTotalLabel" : "summaryTotalLabel")}
                value={t("summaryTotalValue", { count: documents.length })}
              />
              <WorkspaceMetricCard
                detail={localUploadingCount > 0 ? t("uploadPendingAction") : undefined}
                icon={UploadIcon}
                label={t(
                  hasActiveFilters ? "summaryCurrentProcessingLabel" : "summaryProcessingLabel",
                )}
                value={t("summaryProcessingValue", { count: processingCount })}
              />
              <WorkspaceMetricCard
                icon={ScanSearchIcon}
                label={t(hasActiveFilters ? "summaryCurrentIndexedLabel" : "summaryIndexedLabel")}
                value={t("summaryIndexedValue", { count: indexedCount })}
              />
            </>
          )
        }
        metricsClassName="gap-3 md:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-[minmax(0,1.15fr)_repeat(2,minmax(0,1fr))]"
        main={
          isMobile ? (
            resourcesSectionPane
          ) : (
            <WorkbenchLayout
              inspector={resourcesInspectorPane}
              inspectorDescription={t("previewDescription")}
              inspectorTitle={t("previewTitle")}
              main={resourcesMainPane}
              mainClassName="2xl:pr-2"
              mobileTitle={t("pageTitle")}
              section={resourcesSectionPane}
              sectionDescription={t("tableSectionDescription")}
              sectionTitle={t("tableSectionTitle")}
            />
          )
        }
        surface="flat"
        title={t("pageTitle")}
        width="wide"
      />

      {isMobile ? (
        <>
          <DocumentPreviewSheet
            document={selectedDocument}
            onDelete={setPendingDeleteDocument}
            onOpenChange={setPreviewOpen}
            onReindex={(document) => void reindexDocument(document.document_id)}
            onShowVersions={handleShowVersions}
            open={previewOpen && selectedDocument !== null}
          />

          <VersionDrawer
            onClose={closeVersionDrawer}
            open={versionDrawerOpen}
            versions={versions}
          />
        </>
      ) : null}

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
