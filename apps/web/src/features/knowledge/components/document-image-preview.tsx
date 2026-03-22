/**
 * @file 资源图片预览组件模块。
 */

import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";

import type { KnowledgeDocument } from "../api/documents";
import { getDocumentFileUrl } from "@/features/chat/utils/document-file-url";
import { fetchProtectedFileBlob } from "@/lib/api/protected-file";

/**
 * 渲染资源图片预览。
 */
export function DocumentImagePreview({ document }: { document: KnowledgeDocument }) {
  const { t } = useTranslation("knowledge");
  const [resolvedUrl, setResolvedUrl] = useState<string | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);

  useEffect(() => {
    let disposed = false;
    let objectUrl: string | null = null;

    setResolvedUrl(null);
    setLoadFailed(false);

    void fetchProtectedFileBlob(getDocumentFileUrl(document.id))
      .then((blob) => {
        if (disposed) {
          return;
        }
        objectUrl = URL.createObjectURL(blob);
        setResolvedUrl(objectUrl);
      })
      .catch(() => {
        if (!disposed) {
          setLoadFailed(true);
        }
      });

    return () => {
      disposed = true;
      if (objectUrl) {
        URL.revokeObjectURL(objectUrl);
      }
    };
  }, [document.id]);

  return (
    <div className="surface-outline flex min-h-[16rem] items-center justify-center rounded-[1.2rem] p-3">
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
