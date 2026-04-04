import { describe, expect, it } from "vite-plus/test";

import type { KnowledgeDocument } from "./documents";
import { documentListSummaryQueryOptions, documentsListQueryOptions } from "./documents-query";

function buildDocument(status: KnowledgeDocument["status"]): KnowledgeDocument {
  return {
    created_at: "2026-03-31T00:00:00Z",
    document_id: 1,
    file_type: "md",
    id: 1,
    is_latest: true,
    name: "spec.md",
    status,
    updated_at: "2026-03-31T00:00:00Z",
    version: 1,
  };
}

describe("documentsListQueryOptions", () => {
  it("keeps polling while there are pending document ingestions", () => {
    const options = documentsListQueryOptions();
    const refetchInterval = options.refetchInterval as
      | ((query: { state: { data: KnowledgeDocument[] | undefined } }) => number | false)
      | undefined;

    expect(typeof refetchInterval).toBe("function");
    expect(
      refetchInterval?.({
        state: { data: [buildDocument("processing")] },
      }),
    ).toBe(3000);
    expect(
      refetchInterval?.({
        state: { data: [buildDocument("uploaded")] },
      }),
    ).toBe(3000);
  });

  it("stops polling once every document is settled", () => {
    const options = documentsListQueryOptions();
    const refetchInterval = options.refetchInterval as
      | ((query: { state: { data: KnowledgeDocument[] | undefined } }) => number | false)
      | undefined;

    expect(
      refetchInterval?.({
        state: { data: [buildDocument("indexed"), buildDocument("failed")] },
      }),
    ).toBe(false);
    expect(refetchInterval?.({ state: { data: undefined } })).toBe(false);
  });

  it("keeps polling when hidden pending documents still exist outside the current filter", () => {
    const options = documentsListQueryOptions({ status: "indexed" }, { keepPolling: true });
    const refetchInterval = options.refetchInterval as
      | ((query: { state: { data: KnowledgeDocument[] | undefined } }) => number | false)
      | undefined;

    expect(
      refetchInterval?.({
        state: { data: [buildDocument("indexed")] },
      }),
    ).toBe(3000);
  });

  it("polls the lightweight summary while hidden pending documents remain", () => {
    const options = documentListSummaryQueryOptions();
    const refetchInterval = options.refetchInterval as
      | ((query: { state: { data: { pending_count: number } | undefined } }) => number | false)
      | undefined;

    expect(refetchInterval?.({ state: { data: { pending_count: 1 } } })).toBe(3000);
    expect(refetchInterval?.({ state: { data: { pending_count: 0 } } })).toBe(false);
  });
});
