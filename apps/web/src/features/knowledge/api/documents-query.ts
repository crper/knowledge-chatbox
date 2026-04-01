/**
 * @file 资源查询配置模块。
 */

import { mutationOptions, queryOptions, type QueryClient } from "@tanstack/react-query";

import { queryKeys } from "@/lib/api/query-keys";
import {
  deleteDocument,
  getDocumentUploadReadiness,
  getDocumentVersions,
  getDocuments,
  normalizeKnowledgeDocumentListFilters,
  reindexDocument,
  type KnowledgeDocument,
  type KnowledgeDocumentListFilters,
  type DocumentUploadReadiness,
} from "./documents";

export type { DocumentUploadReadiness, KnowledgeDocument };

const DOCUMENTS_POLL_INTERVAL_MS = 3000;

async function invalidateDocuments(queryClient: QueryClient) {
  await queryClient.invalidateQueries({ queryKey: queryKeys.documents.list });
}

function hasPendingDocuments(documents: KnowledgeDocument[] | undefined) {
  return (
    documents?.some(
      (document) => document.status === "processing" || document.status === "uploaded",
    ) ?? false
  );
}

function buildDocumentsListQueryKey(filters?: KnowledgeDocumentListFilters) {
  const normalizedFilters = normalizeKnowledgeDocumentListFilters(filters);
  return [
    ...queryKeys.documents.list,
    normalizedFilters.query ?? null,
    normalizedFilters.type ?? null,
    normalizedFilters.status ?? null,
  ] as const;
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
    queryKey: buildDocumentsListQueryKey(normalizedFilters),
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
