/**
 * @file 资源 Inspector 面板模块。
 */

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";

import type { KnowledgeDocument } from "../api/documents";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from "@/components/ui/empty";
import { Tabs, TabsIndicator, TabsList, TabsPanel, TabsTab } from "@/components/ui/tabs";
import { Link } from "@/lib/app-router";
import { cn } from "@/lib/utils";
import { getDocumentFileUrl } from "@/features/chat/utils/document-file-url";
import { documentVersionsQueryOptions } from "../api/documents-query";
import {
  formatKnowledgeDocumentDateTime,
  formatFileSize,
  getKnowledgeDocumentCategoryLabel,
  getKnowledgeDocumentStatusMeta,
} from "./resource-document-helpers";
import { DocumentVersionList } from "./version-drawer";
import { openProtectedFile, downloadProtectedFile } from "./protected-file-actions";

export type DocumentInspectorTabValue = "details" | "versions" | "actions";

type DocumentInspectorPanelProps = {
  activeTab?: DocumentInspectorTabValue;
  document: KnowledgeDocument | null;
  emptyState?: "no-match" | "selection-required";
  onActiveTabChange?: (value: DocumentInspectorTabValue) => void;
  onDelete: (document: KnowledgeDocument) => void;
  onReindex: (document: KnowledgeDocument) => void;
};

export function DocumentInspectorPanel({
  activeTab,
  document,
  emptyState = "no-match",
  onActiveTabChange,
  onDelete,
  onReindex,
}: DocumentInspectorPanelProps) {
  const { i18n, t } = useTranslation("knowledge");
  const [uncontrolledTab, setUncontrolledTab] = useState<DocumentInspectorTabValue>("details");
  const versionsQuery = useQuery({
    ...documentVersionsQueryOptions(document?.document_id ?? 0),
    enabled: document !== null,
  });
  const resolvedTab = activeTab ?? uncontrolledTab;

  const handleTabChange = (value: string) => {
    const nextTab = value as DocumentInspectorTabValue;
    if (activeTab === undefined) {
      setUncontrolledTab(nextTab);
    }
    onActiveTabChange?.(nextTab);
  };

  if (!document) {
    const emptyTitleKey =
      emptyState === "selection-required" ? "selectionRequiredTitle" : "selectedResourceEmptyTitle";
    const emptyDescriptionKey =
      emptyState === "selection-required"
        ? "selectionRequiredDescription"
        : "selectedResourceEmptyDescription";

    return (
      <section className="surface-panel-subtle flex h-full min-h-[20rem] flex-col justify-center rounded-3xl border border-border/60 p-5">
        <Empty className="bg-transparent">
          <EmptyHeader>
            <EmptyTitle>{t(emptyTitleKey)}</EmptyTitle>
            <EmptyDescription>{t(emptyDescriptionKey)}</EmptyDescription>
          </EmptyHeader>
        </Empty>
      </section>
    );
  }

  const fileUrl = getDocumentFileUrl(document.id);
  const statusMeta = getKnowledgeDocumentStatusMeta(document.status, t);
  const metaRows = [
    [t("filterTypeSectionTitle"), getKnowledgeDocumentCategoryLabel(document.file_type, t)],
    [t("versionHistoryTitle"), t("versionValue", { version: document.version })],
    [t("summaryIndexedLabel"), statusMeta.label],
    [
      t("rowUpdatedLabel"),
      formatKnowledgeDocumentDateTime(document.updated_at, i18n.resolvedLanguage ?? "zh-CN"),
    ],
    ["Size", formatFileSize(document.file_size) ?? "—"],
    ["Chunks", typeof document.chunk_count === "number" ? `${document.chunk_count}` : "—"],
  ] as const;

  return (
    <section className="surface-panel-subtle flex h-full min-h-[20rem] min-w-0 flex-col overflow-hidden rounded-3xl border border-border/60 p-4">
      <div className="space-y-3 border-b border-border/60 pb-4">
        <div className="space-y-1">
          <p className="text-xs font-medium tracking-[0.08em] text-muted-foreground/72 uppercase">
            Inspector
          </p>
          <h2 className="break-words text-base font-semibold tracking-tight text-foreground">
            {document.name}
          </h2>
          <p className="break-all text-xs leading-relaxed text-muted-foreground">
            {document.logical_name || t("rowLogicalNameFallback")}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Badge variant="outline">
            {getKnowledgeDocumentCategoryLabel(document.file_type, t)}
          </Badge>
          <Badge variant={statusMeta.variant}>{statusMeta.label}</Badge>
        </div>
      </div>

      <Tabs className="min-h-0 flex-1 pt-4" onValueChange={handleTabChange} value={resolvedTab}>
        <TabsList className="max-w-full overflow-x-auto [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden">
          <TabsTab value="details">{t("previewTitle")}</TabsTab>
          <TabsTab value="versions">{t("viewVersionsAction")}</TabsTab>
          <TabsTab value="actions">{t("tableSectionTitle")}</TabsTab>
          <TabsIndicator />
        </TabsList>

        <TabsPanel className="min-h-0 pt-4" value="details">
          <div className="space-y-3">
            {metaRows.map(([label, value]) => (
              <div
                className="flex min-w-0 items-start justify-between gap-3 rounded-2xl border border-border/60 bg-background/72 px-3 py-2.5"
                key={label}
              >
                <span className="shrink-0 text-xs text-muted-foreground">{label}</span>
                <span className="min-w-0 break-all text-right text-sm font-medium text-foreground">
                  {value}
                </span>
              </div>
            ))}
          </div>
        </TabsPanel>

        <TabsPanel className="min-h-0 pt-4" value="versions">
          <div className="min-h-0">
            {versionsQuery.isPending ? (
              <div className="rounded-2xl border border-border/60 bg-background/72 p-4 text-sm text-muted-foreground">
                {t("loading")}
              </div>
            ) : versionsQuery.isError ? (
              <div className="rounded-2xl border border-border/60 bg-background/72 p-4 text-sm text-muted-foreground">
                {t("previewLoadFailed")}
              </div>
            ) : (
              <DocumentVersionList versions={versionsQuery.data ?? []} />
            )}
          </div>
        </TabsPanel>

        <TabsPanel className="min-h-0 pt-4" value="actions">
          <div className="flex flex-col gap-2">
            <Link className={cn(buttonVariants({ variant: "outline" }))} to="/chat">
              {t("openChatAction")}
            </Link>
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
            <Button onClick={() => onReindex(document)} type="button" variant="outline">
              {t("reindexAction")}
            </Button>
            <Button onClick={() => onDelete(document)} type="button" variant="ghost">
              {t("deleteAction")}
            </Button>
          </div>
        </TabsPanel>
      </Tabs>
    </section>
  );
}
