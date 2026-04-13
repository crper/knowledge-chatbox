/**
 * @file 资源查询配置模块。
 */

import { mutationOptions, queryOptions, skipToken, type QueryClient } from "@tanstack/react-query";

import { queryKeys } from "@/lib/api/query-keys";
import { fetchProtectedFile } from "@/lib/api/protected-file";
import { getDocumentFileUrl } from "@/lib/api/document-file-url";
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
import { loadDocumentTextPreview } from "./document-preview";

export type { DocumentListSummary, DocumentUploadReadiness, KnowledgeDocument };

const DOCUMENTS_POLL_INTERVAL_MS = 3000;
const DOCUMENTS_POLL_MAX_INTERVAL_MS = 15000;

function computePollInterval(pollCount: number): number {
  const interval = DOCUMENTS_POLL_INTERVAL_MS * Math.pow(1.5, pollCount);
  return Math.min(Math.round(interval), DOCUMENTS_POLL_MAX_INTERVAL_MS);
}

export async function invalidateDocuments(queryClient: QueryClient) {
  await Promise.all([
    queryClient.invalidateQueries({ queryKey: queryKeys.documents.list }),
    queryClient.invalidateQueries({ queryKey: queryKeys.documents.summary }),
  ]);
}

export function hasPendingDocuments(documents: KnowledgeDocument[] | undefined) {
  return (
    documents?.some(
      (document) =>
        document.ingest_status === "processing" || document.ingest_status === "uploaded",
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
  let pollCount = 0;
  return queryOptions({
    queryKey: [
      ...queryKeys.documents.list,
      normalizedFilters.query ?? null,
      normalizedFilters.type ?? null,
      normalizedFilters.status ?? null,
    ] as const,
    queryFn: () => getDocuments(normalizedFilters),
    placeholderData: (previousData) => previousData,
    staleTime: 15_000,
    refetchInterval: (query) => {
      const shouldPoll = options?.keepPolling || hasPendingDocuments(query.state.data);
      if (!shouldPoll) {
        pollCount = 0;
        return false;
      }
      const interval = computePollInterval(pollCount);
      pollCount += 1;
      return interval;
    },
  });
}

/**
 * 获取资源版本查询配置。
 */
export function documentVersionsQueryOptions(documentId: number, enabled = true) {
  return queryOptions({
    queryKey: queryKeys.documents.versions(documentId),
    queryFn: () => getDocumentVersions(documentId),
    enabled,
    staleTime: 30_000,
  });
}

/**
 * 获取资源上传前置条件查询配置。
 */
export function documentUploadReadinessQueryOptions() {
  return queryOptions({
    queryKey: queryKeys.documents.uploadReadiness,
    queryFn: getDocumentUploadReadiness,
    staleTime: 30_000,
  });
}

/**
 * 获取资源列表轻量摘要查询配置。
 */
export function documentListSummaryQueryOptions() {
  let pollCount = 0;
  return queryOptions({
    queryKey: queryKeys.documents.summary,
    queryFn: getDocumentListSummary,
    staleTime: 15_000,
    refetchInterval: (query) => {
      const hasPending = query.state.data?.pending_count;
      if (!hasPending) {
        pollCount = 0;
        return false;
      }
      const interval = computePollInterval(pollCount);
      pollCount += 1;
      return interval;
    },
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

export function documentTextPreviewQueryOptions(
  document: KnowledgeDocument | null,
  enabled: boolean,
) {
  return queryOptions({
    queryKey: queryKeys.documents.textPreview(document?.id, document?.updated_at),
    queryFn: document === null || !enabled ? skipToken : () => loadDocumentTextPreview(document),
  });
}

export function documentImagePreviewQueryOptions(documentId: number) {
  return queryOptions({
    queryKey: queryKeys.documents.imagePreview(documentId),
    queryFn: async () => {
      const blob = await (await fetchProtectedFile(getDocumentFileUrl(documentId))).blob();
      return URL.createObjectURL(blob);
    },
    staleTime: Infinity,
    gcTime: 0,
  });
}
