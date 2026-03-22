/**
 * @file 当前资源详情带组件模块。
 */

import { EyeIcon, FolderOpenIcon } from "lucide-react";
import { useTranslation } from "react-i18next";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { KnowledgeDocument } from "../api/documents";
import {
  formatKnowledgeDocumentDateTime,
  getKnowledgeDocumentCategoryLabel,
  getKnowledgeDocumentStatusMeta,
} from "./resource-document-helpers";

type SelectedResourceBandProps = {
  document: KnowledgeDocument | null;
  onPreviewDocument: (document: KnowledgeDocument) => void;
  onShowVersions: (documentId: number) => void;
};

/**
 * 渲染当前资源详情带。
 */
export function SelectedResourceBand({
  document,
  onPreviewDocument,
  onShowVersions,
}: SelectedResourceBandProps) {
  const { i18n, t } = useTranslation("knowledge");

  if (!document) {
    return null;
  }

  const statusMeta = getKnowledgeDocumentStatusMeta(document.status, t);
  const formattedUpdatedAt = formatKnowledgeDocumentDateTime(
    document.updated_at,
    i18n.resolvedLanguage ?? "zh-CN",
  );

  return (
    <section className="surface-panel-subtle grid gap-4 rounded-[1.75rem] p-4 md:grid-cols-[minmax(0,1.3fr)_minmax(11rem,0.8fr)_auto] md:items-start md:p-5">
      <div className="space-y-2.5">
        <p className="text-ui-caption text-muted-foreground">{t("selectedBandTitle")}</p>
        <div className="space-y-1.5">
          <p className="truncate text-ui-heading text-foreground">{document.name}</p>
          <p className="text-ui-subtle text-muted-foreground">
            {document.logical_name || t("rowLogicalNameFallback")}
          </p>
          <p className="text-ui-subtle text-muted-foreground">{t("selectedBandDescription")}</p>
        </div>
      </div>

      <div className="grid gap-2">
        <div className="flex flex-wrap gap-2">
          <Badge variant="outline">
            {getKnowledgeDocumentCategoryLabel(document.file_type, t)}
          </Badge>
          <Badge variant="outline">{t("versionValue", { version: document.version })}</Badge>
          <Badge variant={statusMeta.variant}>{statusMeta.label}</Badge>
        </div>
        <p className="text-ui-subtle text-muted-foreground">
          {t("rowUpdatedLabel")} {formattedUpdatedAt}
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-2 md:justify-self-end">
        <Button
          aria-label={t("previewActionWithName", { name: document.name })}
          onClick={() => onPreviewDocument(document)}
          size="sm"
          type="button"
          variant="outline"
        >
          <EyeIcon data-icon="inline-start" />
          {t("previewAction")}
        </Button>
        <Button
          onClick={() => onShowVersions(document.document_id)}
          size="sm"
          type="button"
          variant="ghost"
        >
          <FolderOpenIcon data-icon="inline-start" />
          {t("viewVersionsAction")}
        </Button>
      </div>
    </section>
  );
}
