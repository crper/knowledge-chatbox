/**
 * @file 资源查询配置模块。
 */

import { mutationOptions, queryOptions, type QueryClient } from "@tanstack/react-query";

import { queryKeys } from "@/lib/api/query-keys";
import {
  deleteDocument,
  getDocumentVersions,
  getDocuments,
  reindexDocument,
  uploadDocument,
  type KnowledgeDocument,
} from "./documents";

export type { KnowledgeDocument };

async function invalidateDocuments(queryClient: QueryClient) {
  await queryClient.invalidateQueries({ queryKey: queryKeys.documents.list });
}

/**
 * 获取资源列表查询配置。
 */
export function documentsListQueryOptions() {
  return queryOptions({
    queryKey: queryKeys.documents.list,
    queryFn: getDocuments,
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
 * 获取上传资源变更配置。
 */
export function uploadDocumentMutationOptions(queryClient: QueryClient) {
  return mutationOptions({
    mutationFn: (file: File) => uploadDocument(file),
    onSuccess: async () => {
      await invalidateDocuments(queryClient);
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
