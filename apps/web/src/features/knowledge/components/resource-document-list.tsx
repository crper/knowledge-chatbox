/**
 * @file 资源行卡列表组件模块。
 */

import { memo, useRef } from "react";
import { useTranslation } from "react-i18next";
import { useVirtualizer } from "@tanstack/react-virtual";

import type { KnowledgeDocument } from "../api/documents";
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from "@/components/ui/empty";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import { ResourceDocumentRow } from "./resource-document-row";

const VIRTUALIZATION_THRESHOLD = 24;
const VIRTUAL_ROW_HEIGHT = 80;
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
export const ResourceDocumentList = memo(function ResourceDocumentList({
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
  const parentRef = useRef<HTMLDivElement>(null);
  const virtualizer = useVirtualizer({
    count: documents.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => VIRTUAL_ROW_HEIGHT,
    overscan: 3,
  });

  if (documents.length === 0) {
    return (
      <div className={cn("flex items-center justify-center py-16", className)}>
        <Empty className="bg-transparent">
          <EmptyHeader>
            <EmptyTitle>{t("selectedResourceEmptyTitle")}</EmptyTitle>
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
          "min-h-0 overflow-hidden rounded-xl border border-border/40 bg-background/60 backdrop-blur-sm",
          className,
        )}
      >
        <div
          ref={parentRef}
          className="h-full min-h-0 overflow-auto [scrollbar-gutter:stable_both-edges]"
          data-testid="resource-document-list-virtual-scroll"
          style={{ contain: "strict", minHeight: `${Math.min(virtualListHeight, 320)}px` }}
        >
          <div
            className="divide-y divide-border/40"
            style={{
              height: `${virtualizer.getTotalSize()}px`,
              width: "100%",
              position: "relative",
            }}
          >
            {virtualizer.getVirtualItems().map((virtualItem) => {
              const document = documents[virtualItem.index];
              if (!document) return null;
              return (
                <div
                  key={document.id}
                  data-index={virtualItem.index}
                  ref={virtualizer.measureElement}
                  style={{
                    position: "absolute",
                    top: 0,
                    left: 0,
                    width: "100%",
                    transform: `translateY(${virtualItem.start}px)`,
                  }}
                >
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
              );
            })}
          </div>
        </div>
      </section>
    );
  }

  return (
    <section
      className={cn(
        "min-h-0 overflow-hidden rounded-xl border border-border/40 bg-background/60 backdrop-blur-sm",
        className,
      )}
    >
      <ScrollArea className="h-full min-h-0">
        <div className="divide-y divide-border/40">
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
      </ScrollArea>
    </section>
  );
});
