/**
 * @file 资源相关接口请求模块。
 */

import { ApiRequestError, buildApiUrl, openapiRequestRequired } from "@/lib/api/client";
import { apiFetchClient } from "@/lib/api/generated/client";
import type { components } from "@/lib/api/generated/schema";
import { refreshSession } from "@/features/auth/api/auth";
import { expireSessionIfStaleAccessToken } from "@/lib/auth/session-manager";
import { getAccessToken } from "@/lib/auth/token-store";
import {
  extractErrorDetail,
  getUserFacingErrorMessage,
  translateCommonErrorMessage,
} from "@/lib/api/error-response";

export const KNOWLEDGE_DOCUMENT_STATUSES = ["uploaded", "processing", "indexed", "failed"] as const;

export type KnowledgeDocumentStatus = (typeof KNOWLEDGE_DOCUMENT_STATUSES)[number];
export type KnowledgeDocumentListType = "document" | "image" | "markdown" | "pdf" | "text";
export type KnowledgeDocumentListFilters = {
  query?: string;
  status?: KnowledgeDocumentStatus;
  type?: KnowledgeDocumentListType;
};

export type KnowledgeDocument = {
  deduplicated?: boolean;
  id: number;
  document_id: number;
  name: string;
  logical_name?: string;
  version: number;
  hash?: string;
  file_type: string;
  mime_type?: string;
  status: KnowledgeDocumentStatus;
  is_latest: boolean;
  supersedes_version_id?: number | null;
  file_size?: number | null;
  chunk_count?: number | null;
  error_message?: string | null;
  created_by_user_id?: number | null;
  updated_by_user_id?: number | null;
  created_at: string;
  updated_at: string;
  indexed_at?: string | null;
};

type DocumentSummaryRead = components["schemas"]["DocumentSummaryRead"];
type DocumentListSummaryRead = components["schemas"]["DocumentListSummaryRead"];
type DocumentRevisionRead = components["schemas"]["DocumentRevisionRead"];
type DocumentUploadReadinessRead = components["schemas"]["DocumentUploadReadinessRead"];
type DocumentUploadRead = components["schemas"]["DocumentUploadRead"];

export type DocumentUploadReadiness = {
  blocking_reason: "embedding_not_configured" | "pending_embedding_not_configured" | null;
  can_upload: boolean;
  image_fallback: boolean;
};

export type DocumentListSummary = {
  pending_count: number;
};

function toKnowledgeDocument(
  document: DocumentSummaryRead,
  revision: DocumentRevisionRead | null | undefined,
  deduplicated = false,
): KnowledgeDocument {
  return {
    deduplicated,
    id: revision?.id ?? document.id,
    document_id: document.id,
    name: revision?.source_filename ?? document.title,
    logical_name: document.logical_name,
    version: revision?.revision_no ?? 0,
    hash: revision?.content_hash,
    file_type: revision?.file_type ?? "txt",
    mime_type: revision?.mime_type,
    status: (revision?.ingest_status ?? "uploaded") as KnowledgeDocumentStatus,
    is_latest: true,
    supersedes_version_id: revision?.supersedes_revision_id ?? null,
    file_size: revision?.file_size ?? null,
    chunk_count: revision?.chunk_count ?? null,
    error_message: revision?.error_message ?? null,
    created_by_user_id: revision?.created_by_user_id ?? document.created_by_user_id ?? null,
    updated_by_user_id: revision?.updated_by_user_id ?? document.updated_by_user_id ?? null,
    created_at: revision?.created_at ?? document.created_at,
    updated_at: revision?.updated_at ?? document.updated_at,
    indexed_at: revision?.indexed_at ?? null,
  };
}

export function normalizeKnowledgeDocumentListFilters(
  filters?: KnowledgeDocumentListFilters,
): KnowledgeDocumentListFilters {
  const normalizedQuery = filters?.query?.trim();

  return {
    query: normalizedQuery ? normalizedQuery : undefined,
    status: filters?.status,
    type: filters?.type,
  };
}

function toRevisionBaseFields(revision: DocumentRevisionRead) {
  return {
    id: revision.id,
    document_id: revision.document_id,
    name: revision.source_filename,
    version: revision.revision_no,
    hash: revision.content_hash,
    file_type: revision.file_type,
    mime_type: revision.mime_type,
    status: revision.ingest_status as KnowledgeDocumentStatus,
    supersedes_version_id: revision.supersedes_revision_id ?? null,
    file_size: revision.file_size ?? null,
    chunk_count: revision.chunk_count ?? null,
    error_message: revision.error_message ?? null,
    created_by_user_id: revision.created_by_user_id ?? null,
    updated_by_user_id: revision.updated_by_user_id ?? null,
    created_at: revision.created_at,
    updated_at: revision.updated_at,
    indexed_at: revision.indexed_at ?? null,
  };
}

function toKnowledgeDocumentVersion(revision: DocumentRevisionRead): KnowledgeDocument {
  return {
    ...toRevisionBaseFields(revision),
    logical_name: undefined,
    is_latest: false,
  };
}

export async function getDocuments(normalizedFilters: KnowledgeDocumentListFilters) {
  const documents = await openapiRequestRequired<DocumentSummaryRead[]>(
    apiFetchClient.GET("/api/documents", {
      params: {
        query: {
          query: normalizedFilters.query,
          status: normalizedFilters.status,
          type: normalizedFilters.type,
        },
      },
    }),
  );
  return documents.map((document) => toKnowledgeDocument(document, document.latest_revision));
}

export async function getDocumentVersions(documentId: number) {
  const revisions = await openapiRequestRequired<DocumentRevisionRead[]>(
    apiFetchClient.GET("/api/documents/{document_id}/revisions", {
      params: { path: { document_id: documentId } },
    }),
  );
  return revisions.map((revision) => toKnowledgeDocumentVersion(revision));
}

export async function getDocumentUploadReadiness() {
  const readiness = await openapiRequestRequired<DocumentUploadReadinessRead>(
    apiFetchClient.GET("/api/documents/upload-readiness"),
  );
  return {
    blocking_reason: readiness.blocking_reason as DocumentUploadReadiness["blocking_reason"],
    can_upload: readiness.can_upload,
    image_fallback: readiness.image_fallback,
  } satisfies DocumentUploadReadiness;
}

export async function getDocumentListSummary() {
  const summary = await openapiRequestRequired<DocumentListSummaryRead>(
    apiFetchClient.GET("/api/documents/summary"),
  );
  return {
    pending_count: summary.pending_count,
  } satisfies DocumentListSummary;
}

export function uploadDocument(
  file: File,
  options?: {
    onProgress?: (percent: number) => void;
    signal?: AbortSignal;
  },
) {
  const sendUploadRequest = (
    accessToken: string | null,
    canRetryAfterRefresh: boolean,
  ): Promise<KnowledgeDocument> =>
    new Promise((resolve, reject) => {
      const formData = new FormData();
      formData.append("file", file);

      const xhr = new XMLHttpRequest();
      xhr.open("POST", buildApiUrl("/api/documents/upload"));
      xhr.withCredentials = true;
      if (accessToken) {
        xhr.setRequestHeader("Authorization", `Bearer ${accessToken}`);
      }

      xhr.upload.onprogress = (event) => {
        if (!event.lengthComputable || !options?.onProgress || event.total <= 0) {
          return;
        }
        options.onProgress(Math.round((event.loaded / event.total) * 100));
      };

      xhr.onerror = () => {
        reject(
          new ApiRequestError(translateCommonErrorMessage("apiErrorServiceUnavailable"), {
            status: 503,
          }),
        );
      };

      xhr.onabort = () => {
        reject(new DOMException("The upload was aborted.", "AbortError"));
      };

      xhr.onload = async () => {
        const response = new Response(xhr.responseText, {
          status: xhr.status,
          statusText: xhr.statusText,
        });
        const requestAccessToken = accessToken;
        const rawBody = xhr.responseText ?? "";
        let parsedBody: unknown = null;

        if (rawBody.trim()) {
          try {
            parsedBody = JSON.parse(rawBody) as unknown;
          } catch {
            const detail = extractErrorDetail(rawBody, null, response);
            reject(
              new ApiRequestError(getUserFacingErrorMessage(detail, response), {
                code: detail.code,
                status: response.status,
              }),
            );
            return;
          }
        }

        const payload = parsedBody as {
          success?: boolean;
          data?: DocumentUploadRead | null;
        } | null;

        if (response.ok && payload?.success && payload.data) {
          resolve(
            toKnowledgeDocument(
              payload.data.document,
              payload.data.latest_revision,
              payload.data.deduplicated ?? false,
            ),
          );
          return;
        }

        if (response.status === 401 && canRetryAfterRefresh) {
          try {
            const nextAccessToken = await refreshSession();
            const retriedDocument = await sendUploadRequest(nextAccessToken, false);
            resolve(retriedDocument);
            return;
          } catch (error) {
            expireSessionIfStaleAccessToken(requestAccessToken);
            reject(error);
            return;
          }
        }

        const detail = extractErrorDetail(rawBody, parsedBody, response);
        reject(
          new ApiRequestError(getUserFacingErrorMessage(detail, response), {
            code: detail.code,
            status: response.status,
          }),
        );
      };

      if (options?.signal) {
        if (options.signal.aborted) {
          xhr.abort();
          return;
        }

        options.signal.addEventListener("abort", () => xhr.abort(), { once: true });
      }

      xhr.send(formData);
    });

  return sendUploadRequest(getAccessToken(), true);
}

export async function reindexDocument(documentId: number) {
  const revision = await openapiRequestRequired<DocumentRevisionRead>(
    apiFetchClient.POST("/api/documents/{document_id}/reindex", {
      params: { path: { document_id: documentId } },
    }),
  );
  return toKnowledgeDocumentVersion(revision);
}

export function deleteDocument(documentId: number) {
  return openapiRequestRequired<{ status: string }>(
    apiFetchClient.DELETE("/api/documents/{document_id}", {
      params: { path: { document_id: documentId } },
    }),
  );
}
