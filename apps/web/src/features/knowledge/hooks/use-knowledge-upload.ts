import { useCallback, useMemo, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import type { FileRejection } from "react-dropzone";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";

import { invalidateDocuments } from "../api/documents-query";
import { uploadDocument } from "../api/documents";
import { getDocumentUploadRejectionMessage, runDocumentUpload } from "@/lib/document-upload";
import { getErrorMessage } from "@/lib/utils";

export type KnowledgeUploadItem = {
  errorMessage?: string;
  file: File;
  id: string;
  name: string;
  progress: number;
  status: "uploading" | "uploaded" | "failed";
};

export function useKnowledgeUpload() {
  const { t } = useTranslation("knowledge");
  const queryClient = useQueryClient();
  const [uploadItems, setUploadItems] = useState<KnowledgeUploadItem[]>([]);
  const uploadQueueRef = useRef(Promise.resolve());
  const uploadControllersRef = useRef(new Map<string, AbortController>());
  const canceledUploadIdsRef = useRef(new Set<string>());
  const queuedRetryUploadIdsRef = useRef(new Set<string>());

  const updateUploadItem = useCallback((uploadId: string, patch: Partial<KnowledgeUploadItem>) => {
    setUploadItems((currentItems) =>
      currentItems.map((item) => (item.id === uploadId ? { ...item, ...patch } : item)),
    );
  }, []);

  const removeUploadItem = useCallback((uploadId: string) => {
    setUploadItems((currentItems) => currentItems.filter((item) => item.id !== uploadId));
    uploadControllersRef.current.delete(uploadId);
  }, []);

  const isUploadAbortError = useCallback((error: unknown) => {
    return error instanceof DOMException && error.name === "AbortError";
  }, []);

  const uploadOneFile = useCallback(
    async (uploadId: string, file: File) => {
      if (canceledUploadIdsRef.current.has(uploadId)) {
        removeUploadItem(uploadId);
        canceledUploadIdsRef.current.delete(uploadId);
        return;
      }

      const controller = new AbortController();
      uploadControllersRef.current.set(uploadId, controller);

      try {
        const document = await runDocumentUpload({
          failedMessage: t("uploadFailedToast"),
          file,
          onPatch: (patch) => {
            updateUploadItem(uploadId, patch);
          },
          signal: controller.signal,
          upload: uploadDocument,
        });
        removeUploadItem(uploadId);
        toast.success(
          document.deduplicated
            ? t("uploadDeduplicatedToast", { name: document.name })
            : t("uploadSuccessToast", { name: document.name }),
        );
        void invalidateDocuments(queryClient);
      } catch (error) {
        if (canceledUploadIdsRef.current.has(uploadId) || controller.signal.aborted) {
          removeUploadItem(uploadId);
          return;
        }

        if (isUploadAbortError(error)) {
          removeUploadItem(uploadId);
          return;
        }

        updateUploadItem(uploadId, {
          errorMessage: getErrorMessage(error, t("uploadFailedToast")),
          progress: 0,
          status: "failed",
        });
        toast.error(getErrorMessage(error, t("uploadFailedToast")));
      } finally {
        uploadControllersRef.current.delete(uploadId);
        canceledUploadIdsRef.current.delete(uploadId);
        queuedRetryUploadIdsRef.current.delete(uploadId);
      }
    },
    [isUploadAbortError, queryClient, removeUploadItem, t, updateUploadItem],
  );

  const enqueueUploads = useCallback(
    (files: File[]) => {
      if (files.length === 0) {
        return;
      }

      const queuedUploads = files.map((file) => ({
        file,
        id: crypto.randomUUID(),
        name: file.name,
        progress: 0,
        status: "uploading" as const,
      }));

      setUploadItems((currentItems) => [...queuedUploads, ...currentItems]);
      uploadQueueRef.current = uploadQueueRef.current.then(async () => {
        for (const queuedUpload of queuedUploads) {
          await uploadOneFile(queuedUpload.id, queuedUpload.file);
        }
      });
    },
    [uploadOneFile],
  );

  const rejectFiles = useCallback(
    (rejections: FileRejection[]) => {
      if (rejections.length === 0) {
        return;
      }

      const failedUploads = rejections.map((rejection) => ({
        errorMessage: getDocumentUploadRejectionMessage(rejection, {
          failedMessage: t("uploadFailedToast"),
          unsupportedFileTypeMessage: t("uploadHint"),
        }),
        file: rejection.file,
        id: crypto.randomUUID(),
        name: rejection.file.name,
        progress: 0,
        status: "failed" as const,
      }));

      setUploadItems((currentItems) => [...failedUploads, ...currentItems]);
      failedUploads.forEach((failedUpload) => {
        toast.error(failedUpload.errorMessage);
      });
    },
    [t],
  );

  const retryUpload = useCallback(
    (uploadId: string) => {
      const target = uploadItems.find((item) => item.id === uploadId);
      if (!target || target.status !== "failed" || queuedRetryUploadIdsRef.current.has(uploadId)) {
        return;
      }

      queuedRetryUploadIdsRef.current.add(uploadId);
      updateUploadItem(uploadId, {
        errorMessage: undefined,
        progress: 0,
        status: "uploading",
      });
      uploadQueueRef.current = uploadQueueRef.current.then(async () => {
        await uploadOneFile(uploadId, target.file);
      });
    },
    [updateUploadItem, uploadItems, uploadOneFile],
  );

  const removeUpload = useCallback(
    (uploadId: string) => {
      canceledUploadIdsRef.current.delete(uploadId);
      uploadControllersRef.current.get(uploadId)?.abort();
      removeUploadItem(uploadId);
    },
    [removeUploadItem],
  );

  const cancelUpload = useCallback(
    (uploadId: string) => {
      canceledUploadIdsRef.current.add(uploadId);
      uploadControllersRef.current.get(uploadId)?.abort();
      removeUploadItem(uploadId);
    },
    [removeUploadItem],
  );

  const localUploadingCount = useMemo(
    () => uploadItems.filter((item) => item.status === "uploading").length,
    [uploadItems],
  );

  return {
    cancelUpload,
    enqueueUploads,
    localUploadingCount,
    rejectFiles,
    removeUpload,
    retryUpload,
    uploadItems,
  };
}
