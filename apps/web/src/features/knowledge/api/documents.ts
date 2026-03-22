/**
 * @file 资源相关接口请求模块。
 */

import { env } from "@/lib/config/env";
import { ApiRequestError, openapiRequestRequired } from "@/lib/api/client";
import { apiFetchClient } from "@/lib/api/generated/client";
import type { components } from "@/lib/api/generated/schema";
import { refreshSession } from "@/features/auth/api/auth";
import { markSessionExpired } from "@/lib/auth/session-manager";
import { getAccessToken } from "@/lib/auth/token-store";
import {
  extractErrorDetail,
  getUserFacingErrorMessage,
  translateCommonErrorMessage,
} from "@/lib/api/error-response";

export const KNOWLEDGE_DOCUMENT_STATUSES = ["uploaded", "processing", "indexed", "failed"] as const;

export type KnowledgeDocumentStatus = (typeof KNOWLEDGE_DOCUMENT_STATUSES)[number];

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
  origin_path?: string;
  normalized_path?: string | null;
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
type DocumentRevisionRead = components["schemas"]["DocumentRevisionRead"];
type DocumentUploadRead = components["schemas"]["DocumentUploadRead"];

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
    origin_path: revision?.source_path,
    normalized_path: revision?.normalized_path ?? null,
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

function toKnowledgeDocumentVersion(revision: DocumentRevisionRead): KnowledgeDocument {
  return {
    id: revision.id,
    document_id: revision.document_id,
    name: revision.source_filename,
    logical_name: undefined,
    version: revision.revision_no,
    hash: revision.content_hash,
    file_type: revision.file_type,
    mime_type: revision.mime_type,
    status: revision.ingest_status as KnowledgeDocumentStatus,
    is_latest: false,
    supersedes_version_id: revision.supersedes_revision_id ?? null,
    origin_path: revision.source_path,
    normalized_path: revision.normalized_path ?? null,
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

export async function getDocuments() {
  const documents = await openapiRequestRequired<DocumentSummaryRead[]>(
    apiFetchClient.GET("/api/documents"),
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
      xhr.open("POST", `${env.apiBaseUrl}/api/documents/upload`);
      xhr.withCredentials = true;
      if (accessToken) {
        xhr.setRequestHeader("Authorization", `Bearer ${accessToken}`);
      }

      xhr.upload.onprogress = (event) => {
        if (!event.lengthComputable || !options?.onProgress) {
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
            markSessionExpired();
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
