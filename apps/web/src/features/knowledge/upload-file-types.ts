/**
 * @file 统一维护资源与会话上传支持的文件类型。
 */

import type { Accept, FileError } from "react-dropzone";

export const SUPPORTED_UPLOAD_ACCEPT_MAP = {
  "text/plain": [".txt"],
  "text/markdown": [".md"],
  "application/pdf": [".pdf"],
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": [".docx"],
  "image/png": [".png"],
  "image/jpeg": [".jpg", ".jpeg"],
  "image/webp": [".webp"],
} satisfies Accept;

export const UNSUPPORTED_UPLOAD_FILE_ERROR_CODE = "unsupported-file-type";

const MIME_TYPE_TO_KIND = {
  "application/pdf": "document",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "document",
  "image/jpeg": "image",
  "image/png": "image",
  "image/webp": "image",
  "text/markdown": "document",
  "text/plain": "document",
} as const;

export type SupportedUploadKind = "image" | "document";

export function detectSupportedUploadKind(file: File): SupportedUploadKind | null {
  const mimeKind = MIME_TYPE_TO_KIND[file.type as keyof typeof MIME_TYPE_TO_KIND];
  if (mimeKind) {
    return mimeKind;
  }

  const extension = file.name.split(".").pop()?.toLowerCase();
  if (!extension) {
    return null;
  }
  if (["png", "jpg", "jpeg", "webp"].includes(extension)) {
    return "image";
  }
  if (["txt", "md", "pdf", "docx"].includes(extension)) {
    return "document";
  }
  return null;
}

export function validateUploadFile(file: File): FileError | null {
  if (detectSupportedUploadKind(file) !== null) {
    return null;
  }

  return {
    code: UNSUPPORTED_UPLOAD_FILE_ERROR_CODE,
    message: UNSUPPORTED_UPLOAD_FILE_ERROR_CODE,
  };
}
