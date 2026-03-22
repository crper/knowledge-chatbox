/**
 * @file 资源行卡列表组件模块。
 */

import { useTranslation } from "react-i18next";
import { Virtuoso } from "react-virtuoso";

import type { KnowledgeDocument } from "../api/documents";
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from "@/components/ui/empty";
import { cn } from "@/lib/utils";
import { ResourceDocumentRow } from "./resource-document-row";

const VIRTUALIZATION_THRESHOLD = 24;
const VIRTUAL_ROW_HEIGHT = 92;
const VIRTUAL_LIST_MAX_HEIGHT = 560;

type ResourceDocumentListProps = {
  canDelete: boolean;
  className?: string;
  documents: KnowledgeDocument[];
  onDelete: (document: KnowledgeDocument) => void;
  onPreviewDocument: (document: KnowledgeDocument) => void;
  onReindex: (document: KnowledgeDocument) => void;
  onSelectDocument: (document: KnowledgeDocument) => void;
  onShowVersions: (documentId: number) => void;
  selectedDocumentId: number | null;
};

/**
 * 渲染资源行卡列表。
 */
export function ResourceDocumentList({
  canDelete,
  className,
  documents,
  onDelete,
  onPreviewDocument,
  onReindex,
  onSelectDocument,
  onShowVersions,
  selectedDocumentId,
}: ResourceDocumentListProps) {
  const { t } = useTranslation("knowledge");
  const shouldVirtualize = documents.length > VIRTUALIZATION_THRESHOLD;
  const virtualListHeight = Math.min(
    documents.length * VIRTUAL_ROW_HEIGHT + 24,
    VIRTUAL_LIST_MAX_HEIGHT,
  );

  if (documents.length === 0) {
    return (
      <div className={cn("surface-panel-subtle rounded-[1.5rem] p-4", className)}>
        <Empty className="bg-transparent">
          <EmptyHeader>
            <EmptyTitle>{t("emptyState")}</EmptyTitle>
            <EmptyDescription>{t("selectedResourceEmptyDescription")}</EmptyDescription>
          </EmptyHeader>
        </Empty>
      </div>
    );
  }

  if (shouldVirtualize) {
    return (
      <section
        className={cn(
          "surface-panel-subtle min-h-0 overflow-hidden rounded-[1.5rem] p-3 md:p-4",
          className,
        )}
      >
        <Virtuoso
          className="h-full min-h-0 pr-1 [scrollbar-gutter:stable_both-edges]"
          computeItemKey={(_index, document) => String(document.id)}
          data={documents}
          data-testid="resource-document-list-virtual-scroll"
          defaultItemHeight={VIRTUAL_ROW_HEIGHT}
          itemContent={(_index, document) => (
            <div className="pb-2.5 last:pb-0">
              <ResourceDocumentRow
                canDelete={canDelete}
                document={document}
                isSelected={selectedDocumentId === document.id}
                onDelete={onDelete}
                onPreviewDocument={onPreviewDocument}
                onReindex={onReindex}
                onSelectDocument={onSelectDocument}
                onShowVersions={onShowVersions}
              />
            </div>
          )}
          overscan={240}
          style={{ height: "100%", minHeight: `${Math.min(virtualListHeight, 320)}px` }}
        />
      </section>
    );
  }

  return (
    <section
      className={cn(
        "surface-panel-subtle min-h-0 overflow-hidden rounded-[1.5rem] p-3 md:p-4",
        className,
      )}
    >
      <div className="h-full min-h-0 space-y-2.5 overflow-y-auto pr-1 [scrollbar-gutter:stable_both-edges]">
        {documents.map((document) => (
          <ResourceDocumentRow
            canDelete={canDelete}
            document={document}
            isSelected={selectedDocumentId === document.id}
            key={document.id}
            onDelete={onDelete}
            onPreviewDocument={onPreviewDocument}
            onReindex={onReindex}
            onSelectDocument={onSelectDocument}
            onShowVersions={onShowVersions}
          />
        ))}
      </div>
    </section>
  );
}
