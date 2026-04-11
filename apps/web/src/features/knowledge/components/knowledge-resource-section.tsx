/**
 * @file 资源页左侧工作区模块。
 */

import type { ReactNode } from "react";
import type { FileRejection } from "react-dropzone";
import { UploadIcon } from "lucide-react";
import { useTranslation } from "react-i18next";

import { FileDropzone } from "@/components/upload/file-dropzone";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import type { KnowledgeDocument } from "@/features/knowledge/api/documents";
import type { KnowledgeUploadItem } from "@/features/knowledge/hooks/use-knowledge-upload";
import { ResourceDocumentList } from "@/features/knowledge/components/resource-document-list";
import { ResourceWorkbenchToolbar } from "@/features/knowledge/components/resource-workbench-toolbar";
import { UploadQueueSummary } from "@/features/knowledge/components/upload-queue-summary";
import { cn } from "@/lib/utils";

type KnowledgeResourceSectionProps = {
  activeFilterBadges: string[];
  activeFilterCount: number;
  canManageDocuments: boolean;
  clearFilters: () => void;
  documents: KnowledgeDocument[];
  filterTransitioning: boolean;
  isMobile: boolean;
  localUploadingCount: number;
  onCancelUpload: (uploadId: string) => void;
  onDeleteDocument: (document: KnowledgeDocument) => void;
  onEnqueueUploads: (files: File[]) => void;
  onOpenPreviewDocument: (document: KnowledgeDocument) => void;
  onRejectFiles: (rejections: FileRejection[]) => void;
  onRemoveUpload: (uploadId: string) => void;
  onReindexDocument: (documentId: number) => void;
  onRetryUpload: (uploadId: string) => void;
  onSelectDocument: (document: KnowledgeDocument) => void;
  onSetSearchValue: (value: string) => void;
  onShowVersions: (documentId: number) => void;
  processingCount: number;
  renderUploadReadinessAlert: ReactNode;
  searchValue: string;
  selectedDocumentId: number | null;
  statusFilterButtons: ReactNode;
  typeFilterButtons: ReactNode;
  uploadBlocked: boolean;
  uploadItems: KnowledgeUploadItem[];
  uploadReadinessChecking: boolean;
};

/**
 * 渲染资源页左侧工作区，包括上传、筛选和资源列表。
 */
export function KnowledgeResourceSection({
  activeFilterBadges,
  activeFilterCount,
  canManageDocuments,
  clearFilters,
  documents,
  filterTransitioning,
  isMobile,
  localUploadingCount,
  onCancelUpload,
  onDeleteDocument,
  onEnqueueUploads,
  onOpenPreviewDocument,
  onRejectFiles,
  onRemoveUpload,
  onReindexDocument,
  onRetryUpload,
  onSelectDocument,
  onSetSearchValue,
  onShowVersions,
  processingCount,
  renderUploadReadinessAlert,
  searchValue,
  selectedDocumentId,
  statusFilterButtons,
  typeFilterButtons,
  uploadBlocked,
  uploadItems,
  uploadReadinessChecking,
}: KnowledgeResourceSectionProps) {
  const { t } = useTranslation("knowledge");

  return (
    <div className="flex h-full min-h-0 flex-col gap-4">
      {renderUploadReadinessAlert}
      {uploadItems.length > 0 ? (
        <UploadQueueSummary
          items={uploadItems}
          onCancel={onCancelUpload}
          onRemove={onRemoveUpload}
          onRetry={onRetryUpload}
        />
      ) : null}

      <ResourceWorkbenchToolbar
        activeFilterBadges={activeFilterBadges}
        activeFilterCount={activeFilterCount}
        clearFilters={clearFilters}
        isMobile={isMobile}
        renderUploadAction={(fullWidth) =>
          canManageDocuments ? (
            <ResourceUploadAction
              fullWidth={fullWidth}
              localUploadingCount={localUploadingCount}
              onEnqueueUploads={onEnqueueUploads}
              onRejectFiles={onRejectFiles}
              uploadBlocked={uploadBlocked}
              uploadReadinessChecking={uploadReadinessChecking}
            />
          ) : null
        }
        searchValue={searchValue}
        setSearchValue={onSetSearchValue}
        statusFilterButtons={statusFilterButtons}
        typeFilterButtons={typeFilterButtons}
      />

      {processingCount > 0 ? (
        <div className="flex items-center gap-2 rounded-lg bg-primary/4 px-3 py-2 text-xs text-muted-foreground">
          <span className="relative flex size-2">
            <span className="absolute inline-flex size-2 animate-ping bg-primary/60 opacity-75" />
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
          onDelete={onDeleteDocument}
          onPreviewDocument={onOpenPreviewDocument}
          onReindex={(document) => onReindexDocument(document.document_id)}
          onSelectDocument={onSelectDocument}
          onShowVersions={onShowVersions}
          selectedDocumentId={selectedDocumentId}
        />
      </div>
    </div>
  );
}

type ResourceUploadActionProps = {
  fullWidth?: boolean;
  localUploadingCount: number;
  onEnqueueUploads: (files: File[]) => void;
  onRejectFiles: (rejections: FileRejection[]) => void;
  uploadBlocked: boolean;
  uploadReadinessChecking: boolean;
};

function ResourceUploadAction({
  fullWidth = false,
  localUploadingCount,
  onEnqueueUploads,
  onRejectFiles,
  uploadBlocked,
  uploadReadinessChecking,
}: ResourceUploadActionProps) {
  const { t } = useTranslation("knowledge");

  return (
    <FileDropzone
      disabled={uploadBlocked}
      onFilesAccepted={onEnqueueUploads}
      onFilesRejected={onRejectFiles}
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
}
