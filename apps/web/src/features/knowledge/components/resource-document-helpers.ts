/**
 * @file 资源展示辅助函数模块。
 */

import { getDocumentPreviewKind } from "../api/document-preview";
import type { KnowledgeDocumentStatus } from "../api/documents";

type TranslationFn = (key: string) => string;

export type KnowledgeDocumentStatusMeta = {
  label: string;
  variant: "destructive" | "outline" | "secondary";
};

/**
 * 获取资源分类展示文案。
 */
export function getKnowledgeDocumentCategoryLabel(fileType: string, t: TranslationFn) {
  const previewKind = getDocumentPreviewKind(fileType);

  if (previewKind === "image") {
    return t("previewTypeImage");
  }

  if (previewKind === "markdown") {
    return t("previewTypeMarkdown");
  }

  if (previewKind === "text") {
    return t("previewTypeTxt");
  }

  if (previewKind === "pdf") {
    return t("previewTypePdf");
  }

  if (previewKind === "docx") {
    return t("previewTypeDocx");
  }

  return t("previewTypeDocument");
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
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat(locale, {
    hour: "2-digit",
    minute: "2-digit",
    month: "2-digit",
    day: "2-digit",
    year: "numeric",
  }).format(date);
}
