/**
 * @file 资源相关 Hook 模块。
 */

import { useEffect, useMemo } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";

import { currentUserQueryOptions } from "@/features/auth/api/auth-query";
import { queryKeys } from "@/lib/api/query-keys";
import { getErrorMessage } from "@/lib/utils";
import {
  deleteDocumentMutationOptions,
  documentListSummaryQueryOptions,
  documentUploadReadinessQueryOptions,
  documentsListQueryOptions,
  hasPendingDocuments,
  invalidateDocuments,
  reindexDocumentMutationOptions,
} from "../api/documents-query";
import type { KnowledgeDocumentListFilters } from "../api/documents";
import { useKnowledgeUpload } from "./use-knowledge-upload";

/**
 * 封装资源工作区的数据与交互。
 */
export function useKnowledgeWorkspace(filters?: KnowledgeDocumentListFilters) {
  const { t } = useTranslation("knowledge");
  const queryClient = useQueryClient();
  const normalizedQuery = filters?.query?.trim();
  const hasActiveFilters =
    Boolean(normalizedQuery) || filters?.status !== undefined || filters?.type !== undefined;

  const upload = useKnowledgeUpload();

  const currentUserQuery = useQuery(currentUserQueryOptions());
  const uploadReadinessQuery = useQuery(documentUploadReadinessQueryOptions());
  const documentsQuery = useQuery(documentsListQueryOptions(filters));
  const documents = documentsQuery.data ?? [];
  const hasVisiblePendingDocuments = hasPendingDocuments(documents);
  const pendingSummaryQuery = useQuery({
    ...documentListSummaryQueryOptions(),
    enabled: hasActiveFilters && !hasVisiblePendingDocuments,
  });
  const hasHiddenPendingDocuments =
    hasActiveFilters &&
    !hasVisiblePendingDocuments &&
    (pendingSummaryQuery.data?.pending_count ?? 0) > 0;

  useEffect(() => {
    if (!hasHiddenPendingDocuments) {
      return;
    }
    void queryClient.invalidateQueries({ queryKey: queryKeys.documents.list });
  }, [hasHiddenPendingDocuments, pendingSummaryQuery.dataUpdatedAt, queryClient]);

  const deleteMutation = useMutation(deleteDocumentMutationOptions(queryClient));
  const reindexMutation = useMutation({
    ...reindexDocumentMutationOptions(queryClient),
    onSuccess: async (document) => {
      await invalidateDocuments(queryClient);
      toast.success(t("reindexSuccessToast", { name: document.name }));
    },
    onError: (error) => {
      toast.error(getErrorMessage(error, t("reindexFailedToast")));
    },
  });

  const processingCount = useMemo(
    () => documents.filter((document) => document.ingest_status === "processing").length,
    [documents],
  );

  return {
    canManageDocuments: Boolean(currentUserQuery.data),
    canManageProviderSettings: currentUserQuery.data?.role === "admin",
    deleteDocument: (documentId: number) => deleteMutation.mutateAsync(documentId),
    documents,
    documentsFetching: documentsQuery.isFetching,
    documentsPlaceholder: documentsQuery.isPlaceholderData,
    documentsRefreshing: documentsQuery.isFetching && documentsQuery.data !== undefined,
    processingCount,
    reindexDocument: (documentId: number) => reindexMutation.mutateAsync(documentId),
    reindexPending: reindexMutation.isPending,
    uploadReadiness: uploadReadinessQuery.data,
    uploadReadinessPending: uploadReadinessQuery.isPending,
    ...upload,
  };
}
