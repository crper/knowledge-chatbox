/**
 * @file 资源页面模块。
 */

import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { FilesIcon, ScanSearchIcon, UploadIcon } from "lucide-react";
import { capitalize } from "es-toolkit";

import { useNavigate } from "@tanstack/react-router";
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
import { Button } from "@/components/ui/button";
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
import { KNOWLEDGE_TYPE_FILTER_VALUES } from "@/features/knowledge/route-search";
import { useKnowledgeSearch } from "@/features/knowledge/hooks/use-knowledge-search";
import { useKnowledgeWorkspace } from "@/features/knowledge/hooks/use-knowledge-workspace";
import { VersionDrawer } from "@/features/knowledge/components/version-drawer";
import { KnowledgeEmptyState } from "@/features/knowledge/components/knowledge-empty-state";
import { KnowledgeResourceSection } from "@/features/knowledge/components/knowledge-resource-section";
import { useIsMobile } from "@/lib/hooks/use-mobile";

type ResourceTypeFilter = "all" | (typeof KNOWLEDGE_TYPE_FILTER_VALUES)[number];

const TYPE_FILTER_VALUES: ResourceTypeFilter[] = ["all", ...KNOWLEDGE_TYPE_FILTER_VALUES];
const STATUS_FILTER_VALUES: Array<"all" | KnowledgeDocumentStatus> = [
  "all",
  ...KNOWLEDGE_DOCUMENT_STATUSES,
];

function getTypeFilterLabel(value: ResourceTypeFilter, t: (key: string) => string) {
  return t(`typeFilter${capitalize(value)}`);
}

function getStatusFilterLabel(value: "all" | KnowledgeDocumentStatus, t: (key: string) => string) {
  return value === "all" ? t("statusFilterAll") : t(`status${capitalize(value)}`);
}

function resolveSelectedResourceEmptyState(hasDocuments: boolean, hasActiveFilters: boolean) {
  if (!hasDocuments && hasActiveFilters) {
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
  const [versionDrawerDocumentId, setVersionDrawerDocumentId] = useState<number | null>(null);
  const [versionDrawerOpen, setVersionDrawerOpen] = useState(false);
  const typeFilter = (routeSearch.type ?? "all") as ResourceTypeFilter;
  const statusFilter = (routeSearch.status ?? "all") as "all" | KnowledgeDocumentStatus;
  const {
    canManageDocuments,
    canManageProviderSettings,
    cancelUpload,
    deleteDocument,
    documents,
    documentsPlaceholder,
    enqueueUploads,
    localUploadingCount,
    processingCount,
    rejectFiles,
    removeUpload,
    reindexDocument,
    retryUpload,
    uploadReadiness,
    uploadReadinessPending,
    uploadItems,
  } = useKnowledgeWorkspace(routeSearch);
  const indexedCount = useMemo(
    () => documents.filter((document) => document.ingest_status === "indexed").length,
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
  const filterTransitioning = documentsPlaceholder;

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
    if (versionDrawerDocumentId === null) {
      return;
    }

    const hasTargetDocument = documents.some(
      (document) => document.document_id === versionDrawerDocumentId,
    );
    if (hasTargetDocument) {
      return;
    }

    setVersionDrawerOpen(false);
    setVersionDrawerDocumentId(null);
  }, [documents, versionDrawerDocumentId]);

  useEffect(() => {
    if (isMobile || selectedDocumentId !== null || documents.length === 0) {
      return;
    }

    setInspectorTab("details");
    setSelectedDocumentId(documents[0]?.id ?? null);
  }, [documents, isMobile, selectedDocumentId]);

  const openPreviewForDocument = (document: KnowledgeDocument) => {
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
      setVersionDrawerDocumentId(documentId);
      setVersionDrawerOpen(true);
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
                onClick={() =>
                  navigate({ to: "/settings/$section", params: { section: "providers" } })
                }
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

  const desktopTypeFilterButtons = useMemo(
    () =>
      TYPE_FILTER_VALUES.map((value) => (
        <Button
          key={value}
          onClick={() => updateRouteSearch({ type: value === "all" ? undefined : value })}
          size="sm"
          type="button"
          variant={typeFilter === value ? "default" : "outline"}
        >
          {getTypeFilterLabel(value, t)}
        </Button>
      )),
    [t, typeFilter, updateRouteSearch],
  );

  const desktopStatusFilterButtons = useMemo(
    () =>
      STATUS_FILTER_VALUES.map((value) => (
        <Button
          key={value}
          onClick={() => updateRouteSearch({ status: value === "all" ? undefined : value })}
          size="sm"
          type="button"
          variant={statusFilter === value ? "secondary" : "outline"}
        >
          {getStatusFilterLabel(value, t)}
        </Button>
      )),
    [t, statusFilter, updateRouteSearch],
  );

  const resourcesSectionPane = (
    <KnowledgeResourceSection
      activeFilterBadges={activeFilterBadges}
      activeFilterCount={activeFilterCount}
      canManageDocuments={canManageDocuments}
      clearFilters={clearFilters}
      documents={documents}
      filterTransitioning={filterTransitioning}
      isMobile={isMobile}
      localUploadingCount={localUploadingCount}
      onCancelUpload={cancelUpload}
      onDeleteDocument={setPendingDeleteDocument}
      onEnqueueUploads={enqueueUploads}
      onOpenPreviewDocument={openPreviewForDocument}
      onRejectFiles={rejectFiles}
      onRemoveUpload={removeUpload}
      onReindexDocument={(documentId) => void reindexDocument(documentId)}
      onRetryUpload={retryUpload}
      onSelectDocument={openPreviewForDocument}
      onSetSearchValue={setSearchValue}
      onShowVersions={handleShowVersions}
      processingCount={processingCount}
      renderUploadReadinessAlert={renderUploadReadinessAlert()}
      searchValue={searchValue}
      selectedDocumentId={selectedDocumentId}
      statusFilterButtons={desktopStatusFilterButtons}
      typeFilterButtons={desktopTypeFilterButtons}
      uploadBlocked={uploadBlocked}
      uploadItems={uploadItems}
      uploadReadinessChecking={uploadReadinessChecking}
    />
  );

  const resourcesMainPane =
    !hasDocuments && !hasActiveFilters && !filterTransitioning ? (
      <KnowledgeEmptyState
        canManageDocuments={canManageDocuments}
        onFilesAccepted={enqueueUploads}
        onFilesRejected={rejectFiles}
        uploadBlocked={uploadBlocked}
        uploadReadinessChecking={uploadReadinessChecking}
      />
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
            documentId={versionDrawerDocumentId}
            onClose={() => {
              setVersionDrawerOpen(false);
              setVersionDrawerDocumentId(null);
            }}
            open={versionDrawerOpen}
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
