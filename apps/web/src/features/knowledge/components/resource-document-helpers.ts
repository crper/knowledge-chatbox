/**
 * @file 资源展示辅助函数模块。
 */

import { formatDateTime } from "@/lib/date-utils";
import { getDocumentPreviewKind, type DocumentPreviewKind } from "../api/document-preview";
import type { KnowledgeDocumentStatus } from "../api/documents";

type TranslationFn = (key: string) => string;

const FILE_SIZE_UNITS = ["B", "KB", "MB", "GB"] as const;

export function formatFileSize(bytes: number | null | undefined) {
  if (typeof bytes !== "number" || Number.isNaN(bytes) || bytes <= 0) {
    return null;
  }

  let value = bytes;
  let unitIndex = 0;

  while (value >= 1024 && unitIndex < FILE_SIZE_UNITS.length - 1) {
    value /= 1024;
    unitIndex += 1;
  }

  const unit = FILE_SIZE_UNITS[unitIndex];
  return unitIndex === 0 ? `${value} ${unit}` : `${value.toFixed(1)} ${unit}`;
}

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

/**
 * 按当前语言格式化资源时间。
 */
export function formatKnowledgeDocumentDateTime(value: string, locale: string) {
  return formatDateTime(value, locale) || value;
}
