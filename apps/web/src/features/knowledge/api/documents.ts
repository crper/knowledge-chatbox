/**
 * @file 资源相关接口请求模块。
 */

import { openapiRequestRequired, parseEnvelopeFromRawBody } from "@/lib/api/client";
import { authenticatedUpload } from "@/lib/api/authenticated-upload";
import { apiFetchClient } from "@/lib/api/generated/client";
import type { components } from "@/lib/api/generated/schema";
import { buildApiUrl } from "@/lib/config/env";

export const KNOWLEDGE_DOCUMENT_STATUSES = ["uploaded", "processing", "indexed", "failed"] as const;

export type KnowledgeDocumentStatus = (typeof KNOWLEDGE_DOCUMENT_STATUSES)[number];

function toKnowledgeDocumentStatus(status: string | null | undefined): KnowledgeDocumentStatus {
  if (status && (KNOWLEDGE_DOCUMENT_STATUSES as readonly string[]).includes(status)) {
    return status as KnowledgeDocumentStatus;
  }
  if (import.meta.env.DEV && status) {
    console.warn(`Unknown document status: "${status}", defaulting to "uploaded"`);
  }
  return "uploaded";
}

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
  revision_no: number;
  content_hash?: string;
  file_type: string;
  mime_type?: string;
  ingest_status: KnowledgeDocumentStatus;
  is_latest: boolean;
  supersedes_revision_id?: number | null;
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

const BLOCKING_REASONS = ["embedding_not_configured", "pending_embedding_not_configured"] as const;

function toBlockingReason(
  reason: string | null | undefined,
): DocumentUploadReadiness["blocking_reason"] {
  if (reason && (BLOCKING_REASONS as readonly string[]).includes(reason)) {
    return reason as DocumentUploadReadiness["blocking_reason"];
  }
  return null;
}

function toDocumentUploadReadiness(
  readiness: DocumentUploadReadinessRead,
): DocumentUploadReadiness {
  return {
    blocking_reason: toBlockingReason(readiness.blocking_reason),
    can_upload: readiness.can_upload,
    image_fallback: readiness.image_fallback,
  };
}

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
    revision_no: revision?.revision_no ?? 0,
    content_hash: revision?.content_hash,
    file_type: revision?.file_type ?? "txt",
    mime_type: revision?.mime_type,
    ingest_status: toKnowledgeDocumentStatus(revision?.ingest_status ?? "uploaded"),
    is_latest: true,
    supersedes_revision_id: revision?.supersedes_revision_id ?? null,
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
    revision_no: revision.revision_no,
    content_hash: revision.content_hash,
    file_type: revision.file_type,
    mime_type: revision.mime_type,
    ingest_status: toKnowledgeDocumentStatus(revision.ingest_status),
    supersedes_revision_id: revision.supersedes_revision_id ?? null,
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
  return toDocumentUploadReadiness(readiness);
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
  const formData = new FormData();
  formData.append("file", file);

  return authenticatedUpload({
    body: formData,
    onProgress: options?.onProgress,
    signal: options?.signal,
    url: buildApiUrl("/api/documents/upload"),
  }).then(({ response, responseText: rawBody }) => {
    const payload = parseEnvelopeFromRawBody<DocumentUploadRead>(rawBody, response);
    return toKnowledgeDocument(
      payload.document,
      payload.latest_revision,
      payload.deduplicated ?? false,
    );
  });
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
