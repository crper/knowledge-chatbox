/**
 * @file 资源相关 Hook 模块。
 */

import { useCallback, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { FileRejection } from "react-dropzone";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";

import { currentUserQueryOptions } from "@/features/auth/api/auth-query";
import { queryKeys } from "@/lib/api/query-keys";
import { getDocumentUploadRejectionMessage, runDocumentUpload } from "@/lib/document-upload";
import {
  deleteDocumentMutationOptions,
  documentVersionsQueryOptions,
  documentsListQueryOptions,
  reindexDocumentMutationOptions,
  type KnowledgeDocument,
} from "../api/documents-query";
import { uploadDocument } from "../api/documents";

type KnowledgeUploadItem = {
  errorMessage?: string;
  file: File;
  id: string;
  name: string;
  progress: number;
  status: "uploading" | "failed";
};

/**
 * 封装资源工作区的数据与交互。
 */
export function useKnowledgeWorkspace() {
  const { t } = useTranslation("knowledge");
  const queryClient = useQueryClient();
  const [versionDrawerOpen, setVersionDrawerOpen] = useState(false);
  const [versions, setVersions] = useState<KnowledgeDocument[]>([]);
  const [uploadItems, setUploadItems] = useState<KnowledgeUploadItem[]>([]);
  const uploadQueueRef = useRef(Promise.resolve());
  const uploadControllersRef = useRef(new Map<string, AbortController>());
  const canceledUploadIdsRef = useRef(new Set<string>());

  const currentUserQuery = useQuery(currentUserQueryOptions());
  const documentsQuery = useQuery(documentsListQueryOptions());

  const deleteMutation = useMutation(deleteDocumentMutationOptions(queryClient));
  const reindexMutation = useMutation({
    ...reindexDocumentMutationOptions(queryClient),
    onSuccess: async (document) => {
      await queryClient.invalidateQueries({ queryKey: queryKeys.documents.list });
      toast.success(t("reindexSuccessToast", { name: document.name }));
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : t("reindexFailedToast"));
    },
  });

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
        updateUploadItem(uploadId, {
          errorMessage: undefined,
          progress: 100,
        });
        await queryClient.invalidateQueries({ queryKey: queryKeys.documents.list });
        removeUploadItem(uploadId);
        toast.success(
          document.deduplicated
            ? t("uploadDeduplicatedToast", { name: document.name })
            : t("uploadSuccessToast", { name: document.name }),
        );
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
          errorMessage: error instanceof Error ? error.message : t("uploadFailedToast"),
          progress: 0,
          status: "failed",
        });
        toast.error(error instanceof Error ? error.message : t("uploadFailedToast"));
      } finally {
        uploadControllersRef.current.delete(uploadId);
        canceledUploadIdsRef.current.delete(uploadId);
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
      if (!target) {
        return;
      }

      uploadQueueRef.current = uploadQueueRef.current.then(async () => {
        await uploadOneFile(uploadId, target.file);
      });
    },
    [uploadItems, uploadOneFile],
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

  const showVersions = async (documentId: number) => {
    const result = await queryClient.fetchQuery(documentVersionsQueryOptions(documentId));
    setVersions(result);
    setVersionDrawerOpen(true);
  };

  const documents = documentsQuery.data ?? [];

  return {
    canManageDocuments: Boolean(currentUserQuery.data),
    deleteDocument: (documentId: number) => deleteMutation.mutateAsync(documentId),
    documents,
    cancelUpload,
    enqueueUploads,
    localUploadingCount: uploadItems.filter((item) => item.status === "uploading").length,
    rejectFiles,
    removeUpload,
    retryUpload,
    processingCount: documents.filter((document) => document.status === "processing").length,
    reindexDocument: (documentId: number) => reindexMutation.mutateAsync(documentId),
    reindexPending: reindexMutation.isPending,
    showVersions,
    uploadItems,
    versionDrawerOpen,
    versions,
    closeVersionDrawer: () => setVersionDrawerOpen(false),
  };
}
