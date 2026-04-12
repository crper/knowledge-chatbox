/**
 * @file 资源预览数据工具模块。
 */

import type { KnowledgeDocument } from "./documents";
import { getDocumentFileUrl } from "@/features/chat/utils/document-file-url";
import { fetchProtectedFileText } from "@/lib/api/protected-file";
import { SUPPORTED_UPLOAD_TYPES } from "../upload-file-types";

const DOCUMENT_TEXT_PREVIEW_LIMIT_BYTES = 1024 * 1024;

export type DocumentPreviewKind = "image" | "markdown" | "text" | "pdf" | "docx" | "unsupported";

const EXTENSION_TO_PREVIEW_KIND: Record<string, DocumentPreviewKind> = {};
for (const { extensions, kind, mimeType } of SUPPORTED_UPLOAD_TYPES) {
  for (const ext of extensions) {
    const key = ext.slice(1);
    if (kind === "image") {
      EXTENSION_TO_PREVIEW_KIND[key] = "image";
    } else if (mimeType === "text/markdown") {
      EXTENSION_TO_PREVIEW_KIND[key] = "markdown";
    } else if (mimeType === "text/plain") {
      EXTENSION_TO_PREVIEW_KIND[key] = "text";
    } else if (mimeType === "application/pdf") {
      EXTENSION_TO_PREVIEW_KIND[key] = "pdf";
    } else if (
      mimeType === "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
    ) {
      EXTENSION_TO_PREVIEW_KIND[key] = "docx";
    }
  }
}

type DocumentTextPreviewResult =
  | {
      kind: "text";
      content: string;
    }
  | {
      kind: "too-large";
    };

export function getDocumentPreviewKind(fileType: string): DocumentPreviewKind {
  return EXTENSION_TO_PREVIEW_KIND[fileType.trim().toLowerCase()] ?? "unsupported";
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
