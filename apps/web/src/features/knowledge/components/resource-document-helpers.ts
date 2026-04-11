/**
 * @file 资源展示辅助函数模块。
 */

import { formatFileSize } from "@/lib/utils";
import { getDocumentPreviewKind, type DocumentPreviewKind } from "../api/document-preview";
import type { KnowledgeDocumentStatus } from "../api/documents";

type TranslationFn = (key: string) => string;

export { formatFileSize };

export function getDocumentTypeLabel(previewKind: DocumentPreviewKind, t: TranslationFn) {
  switch (previewKind) {
    case "image":
      return t("previewTypeImage");
    case "markdown":
      return t("previewTypeMarkdown");
    case "text":
      return t("previewTypeTxt");
    case "pdf":
      return t("previewTypePdf");
    case "docx":
      return t("previewTypeDocx");
    default:
      return t("previewTypeDocument");
  }
}

type KnowledgeDocumentStatusMeta = {
  label: string;
  variant: "destructive" | "outline" | "secondary";
};

/**
 * 获取资源分类展示文案。
 */
export function getKnowledgeDocumentCategoryLabel(fileType: string, t: TranslationFn) {
  return getDocumentTypeLabel(getDocumentPreviewKind(fileType), t);
}

/**
 * 获取资源状态展示文案与徽标样式。
 */
export function getKnowledgeDocumentStatusMeta(
  status: KnowledgeDocumentStatus,
  t: TranslationFn,
): KnowledgeDocumentStatusMeta {
  if (status === "failed") {
    return {
      label: t("statusFailed"),
      variant: "destructive",
    };
  }

  if (status === "indexed") {
    return {
      label: t("statusIndexed"),
      variant: "secondary",
    };
  }

  return {
    label: t(status === "processing" ? "statusProcessing" : "statusUploaded"),
    variant: "outline",
  };
}
