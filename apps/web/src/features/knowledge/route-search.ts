/**
 * @file Knowledge 路由 search 契约。
 */

import {
  KNOWLEDGE_DOCUMENT_STATUSES,
  normalizeKnowledgeDocumentListFilters,
  type KnowledgeDocumentListFilters,
  type KnowledgeDocumentListType,
  type KnowledgeDocumentStatus,
} from "./api/documents";

export const KNOWLEDGE_TYPE_FILTER_VALUES = [
  "document",
  "image",
  "markdown",
  "pdf",
  "text",
] as const satisfies readonly KnowledgeDocumentListType[];

const KNOWLEDGE_TYPE_FILTER_SET = new Set<string>(KNOWLEDGE_TYPE_FILTER_VALUES);
const KNOWLEDGE_STATUS_FILTER_SET = new Set<string>(KNOWLEDGE_DOCUMENT_STATUSES);

export type KnowledgeRouteSearch = KnowledgeDocumentListFilters;

export function normalizeKnowledgeRouteSearch(
  search: Record<string, unknown>,
): KnowledgeRouteSearch {
  const query = typeof search.query === "string" ? search.query : undefined;
  const type =
    typeof search.type === "string" && KNOWLEDGE_TYPE_FILTER_SET.has(search.type)
      ? (search.type as KnowledgeDocumentListType)
      : undefined;
  const status =
    typeof search.status === "string" && KNOWLEDGE_STATUS_FILTER_SET.has(search.status)
      ? (search.status as KnowledgeDocumentStatus)
      : undefined;

  return normalizeKnowledgeDocumentListFilters({
    query,
    status,
    type,
  });
}

export function readKnowledgeRouteSearch(searchParams: URLSearchParams): KnowledgeRouteSearch {
  return normalizeKnowledgeRouteSearch({
    query: searchParams.get("query"),
    status: searchParams.get("status"),
    type: searchParams.get("type"),
  });
}

export function buildKnowledgeRoutePath(search: KnowledgeRouteSearch) {
  const searchParams = new URLSearchParams();

  if (search.query) {
    searchParams.set("query", search.query);
  }
  if (search.type) {
    searchParams.set("type", search.type);
  }
  if (search.status) {
    searchParams.set("status", search.status);
  }

  const serialized = searchParams.toString();
  return serialized.length > 0 ? `/knowledge?${serialized}` : "/knowledge";
}
