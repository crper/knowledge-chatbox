/**
 * @file 资源图片预览组件模块。
 */

import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";

import type { KnowledgeDocument } from "../api/documents";
import { documentImagePreviewQueryOptions } from "../api/documents-query";

export function DocumentImagePreview({ document }: { document: KnowledgeDocument }) {
  const { t } = useTranslation("knowledge");

  const { data: resolvedUrl, isError: loadFailed } = useQuery(
    documentImagePreviewQueryOptions(document.id),
  );

  return (
    <div className="surface-light flex min-h-[16rem] items-center justify-center rounded-xl p-3">
      {loadFailed ? (
        <p className="text-sm text-muted-foreground">{t("previewLoadFailed")}</p>
      ) : resolvedUrl ? (
        <img
          alt={document.name}
          className="max-h-[70vh] w-auto max-w-full rounded-xl border border-border/70 bg-background object-contain"
          src={resolvedUrl}
        />
      ) : (
        <p className="text-sm text-muted-foreground">{t("previewLoading")}</p>
      )}
    </div>
  );
}
