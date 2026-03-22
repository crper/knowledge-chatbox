/**
 * @file 资源预览数据工具模块。
 */

import type { KnowledgeDocument } from "./documents";
import { getDocumentFileUrl } from "@/features/chat/utils/document-file-url";
import { fetchProtectedFileText } from "@/lib/api/protected-file";

export const DOCUMENT_TEXT_PREVIEW_LIMIT_BYTES = 1024 * 1024;

const IMAGE_FILE_TYPES = new Set(["png", "jpg", "jpeg", "webp", "gif"]);
const MARKDOWN_FILE_TYPES = new Set(["md", "markdown"]);
const TEXT_FILE_TYPES = new Set(["txt"]);

export type DocumentPreviewKind = "image" | "markdown" | "text" | "pdf" | "docx" | "unsupported";

export type DocumentTextPreviewResult =
  | {
      kind: "text";
      content: string;
    }
  | {
      kind: "too-large";
    };

/**
 * 根据文件类型推导预览模式。
 */
export function getDocumentPreviewKind(fileType: string): DocumentPreviewKind {
  const normalizedType = fileType.trim().toLowerCase();

  if (IMAGE_FILE_TYPES.has(normalizedType)) {
    return "image";
  }

  if (MARKDOWN_FILE_TYPES.has(normalizedType)) {
    return "markdown";
  }

  if (TEXT_FILE_TYPES.has(normalizedType)) {
    return "text";
  }

  if (normalizedType === "pdf") {
    return "pdf";
  }

  if (normalizedType === "docx") {
    return "docx";
  }

  return "unsupported";
}

/**
 * 读取资源文本预览。
 */
export async function loadDocumentTextPreview(
  document: KnowledgeDocument,
): Promise<DocumentTextPreviewResult> {
  if ((document.file_size ?? 0) > DOCUMENT_TEXT_PREVIEW_LIMIT_BYTES) {
    return { kind: "too-large" };
  }

  return {
    kind: "text",
    content: await fetchProtectedFileText(getDocumentFileUrl(document.id)),
  };
}
