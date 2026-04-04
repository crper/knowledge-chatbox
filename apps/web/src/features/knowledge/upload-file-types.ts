/**
 * @file 统一维护资源与会话上传支持的文件类型。
 */

import type { Accept, FileError } from "react-dropzone";

export const UNSUPPORTED_UPLOAD_FILE_ERROR_CODE = "unsupported-file-type";

export type SupportedUploadKind = "image" | "document";

const SUPPORTED_UPLOAD_TYPES = [
  { extensions: [".txt"], kind: "document", mimeType: "text/plain" },
  { extensions: [".md"], kind: "document", mimeType: "text/markdown" },
  { extensions: [".pdf"], kind: "document", mimeType: "application/pdf" },
  {
    extensions: [".docx"],
    kind: "document",
    mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  },
  { extensions: [".png"], kind: "image", mimeType: "image/png" },
  { extensions: [".jpg", ".jpeg"], kind: "image", mimeType: "image/jpeg" },
  { extensions: [".webp"], kind: "image", mimeType: "image/webp" },
] as const satisfies readonly {
  extensions: readonly string[];
  kind: SupportedUploadKind;
  mimeType: string;
}[];

export const SUPPORTED_UPLOAD_ACCEPT_MAP: Accept = Object.fromEntries(
  SUPPORTED_UPLOAD_TYPES.map(({ extensions, mimeType }) => [mimeType, [...extensions]]),
);

const MIME_TYPE_TO_KIND: Record<string, SupportedUploadKind> = Object.fromEntries(
  SUPPORTED_UPLOAD_TYPES.map(({ kind, mimeType }) => [mimeType, kind]),
);

const EXTENSION_TO_KIND: Record<string, SupportedUploadKind> = Object.fromEntries(
  SUPPORTED_UPLOAD_TYPES.flatMap(({ extensions, kind }) =>
    extensions.map((extension) => [extension.slice(1), kind]),
  ),
);

export function detectSupportedUploadKind(file: File): SupportedUploadKind | null {
  const mimeKind = MIME_TYPE_TO_KIND[file.type.toLowerCase()];
  if (mimeKind) {
    return mimeKind;
  }

  const extension = file.name.split(".").pop()?.toLowerCase();
  if (!extension) {
    return null;
  }
  return EXTENSION_TO_KIND[extension] ?? null;
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
