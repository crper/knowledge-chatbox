import type { FileRejection } from "react-dropzone";

import { UNSUPPORTED_UPLOAD_FILE_ERROR_CODE } from "@/features/knowledge/upload-file-types";

export type DocumentUploadPatch = {
  errorMessage?: string;
  progress?: number;
  status?: "uploading" | "uploaded" | "failed";
};

type DocumentUploadMessages = {
  failedMessage: string;
  unsupportedFileTypeMessage: string;
};

type UploadDocumentFn<TResult> = (
  file: File,
  options?: {
    onProgress?: (percent: number) => void;
    signal?: AbortSignal;
  },
) => Promise<TResult>;

export function getDocumentUploadErrorMessage(error: unknown, fallbackMessage: string) {
  return error instanceof Error ? error.message : fallbackMessage;
}

export function getDocumentUploadRejectionMessage(
  rejection: FileRejection,
  messages: DocumentUploadMessages,
) {
  const primaryError = rejection.errors[0];
  if (!primaryError) {
    return messages.failedMessage;
  }

  if (
    primaryError.code === "file-invalid-type" ||
    primaryError.code === UNSUPPORTED_UPLOAD_FILE_ERROR_CODE
  ) {
    return messages.unsupportedFileTypeMessage;
  }

  return primaryError.message || messages.failedMessage;
}

export async function runDocumentUpload<TResult>({
  failedMessage,
  file,
  onPatch,
  signal,
  upload,
}: {
  failedMessage: string;
  file: File;
  onPatch: (patch: DocumentUploadPatch) => void;
  signal?: AbortSignal;
  upload: UploadDocumentFn<TResult>;
}) {
  onPatch({
    errorMessage: undefined,
    progress: 0,
    status: "uploading",
  });

  try {
    const result = await upload(file, {
      onProgress: (progress) => {
        onPatch({ progress, status: "uploading" });
      },
      signal,
    });
    onPatch({
      errorMessage: undefined,
      progress: 100,
      status: "uploaded",
    });
    return result;
  } catch (error) {
    const errorMessage = getDocumentUploadErrorMessage(error, failedMessage);
    onPatch({
      errorMessage,
      progress: 0,
      status: "failed",
    });
    throw new Error(errorMessage);
  }
}
