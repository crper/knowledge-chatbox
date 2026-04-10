/**
 * @file 资源查询配置模块。
 */

import { mutationOptions, queryOptions, type QueryClient } from "@tanstack/react-query";

import { queryKeys } from "@/lib/api/query-keys";
import {
  deleteDocument,
  getDocumentListSummary,
  getDocumentUploadReadiness,
  getDocumentVersions,
  getDocuments,
  normalizeKnowledgeDocumentListFilters,
  type DocumentListSummary,
  reindexDocument,
  type KnowledgeDocument,
  type KnowledgeDocumentListFilters,
  type DocumentUploadReadiness,
} from "./documents";

export type { DocumentListSummary, DocumentUploadReadiness, KnowledgeDocument };

const DOCUMENTS_POLL_INTERVAL_MS = 3000;

export async function invalidateDocuments(queryClient: QueryClient) {
  await Promise.all([
    queryClient.invalidateQueries({ queryKey: queryKeys.documents.list }),
    queryClient.invalidateQueries({ queryKey: queryKeys.documents.summary }),
  ]);
}

export function hasPendingDocuments(documents: KnowledgeDocument[] | undefined) {
  return (
    documents?.some(
      (document) => document.status === "processing" || document.status === "uploaded",
    ) ?? false
  );
}

type DocumentsListQueryOptionsInput = {
  keepPolling?: boolean;
};

/**
 * 获取资源列表查询配置。
 */
export function documentsListQueryOptions(
  filters?: KnowledgeDocumentListFilters,
  options?: DocumentsListQueryOptionsInput,
) {
  const normalizedFilters = normalizeKnowledgeDocumentListFilters(filters);
  return queryOptions({
    queryKey: [
      ...queryKeys.documents.list,
      normalizedFilters.query ?? null,
      normalizedFilters.type ?? null,
      normalizedFilters.status ?? null,
    ] as const,
    queryFn: () => getDocuments(normalizedFilters),
    placeholderData: (previousData) => previousData,
    refetchInterval: (query) =>
      options?.keepPolling ||
      hasPendingDocuments(query.state.data as KnowledgeDocument[] | undefined)
        ? DOCUMENTS_POLL_INTERVAL_MS
        : false,
  });
}

/**
 * 获取资源版本查询配置。
 */
export function documentVersionsQueryOptions(documentId: number) {
  return queryOptions({
    queryKey: queryKeys.documents.versions(documentId),
    queryFn: () => getDocumentVersions(documentId),
  });
}

/**
 * 获取资源上传前置条件查询配置。
 */
export function documentUploadReadinessQueryOptions() {
  return queryOptions({
    queryKey: queryKeys.documents.uploadReadiness,
    queryFn: getDocumentUploadReadiness,
  });
}

/**
 * 获取资源列表轻量摘要查询配置。
 */
export function documentListSummaryQueryOptions() {
  return queryOptions({
    queryKey: queryKeys.documents.summary,
    queryFn: getDocumentListSummary,
    refetchInterval: (query) =>
      (query.state.data as DocumentListSummary | undefined)?.pending_count
        ? DOCUMENTS_POLL_INTERVAL_MS
        : false,
  });
}

/**
 * 获取删除资源变更配置。
 */
export function deleteDocumentMutationOptions(queryClient: QueryClient) {
  return mutationOptions({
    mutationFn: deleteDocument,
    onSuccess: async () => {
      await invalidateDocuments(queryClient);
    },
  });
}

/**
 * 获取重建索引变更配置。
 */
export function reindexDocumentMutationOptions(queryClient: QueryClient) {
  return mutationOptions({
    mutationFn: reindexDocument,
    onSuccess: async () => {
      await invalidateDocuments(queryClient);
    },
  });
}
