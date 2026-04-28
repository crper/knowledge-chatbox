import { describe, expect, it } from "vite-plus/test";

import type { KnowledgeDocument } from "./documents";
import { documentListSummaryQueryOptions, documentsListQueryOptions } from "./documents-query";

function buildDocument(ingest_status: KnowledgeDocument["ingest_status"]): KnowledgeDocument {
  return {
    created_at: "2026-03-31T00:00:00Z",
    document_id: 1,
    file_type: "md",
    id: 1,
    is_latest: true,
    name: "spec.md",
    ingest_status,
    updated_at: "2026-03-31T00:00:00Z",
    revision_no: 1,
  };
}

describe("documentsListQueryOptions", () => {
  it("keeps polling while there are pending document ingestions", () => {
    const options = documentsListQueryOptions();
    const refetchInterval = options.refetchInterval as
      | ((query: { state: { data: KnowledgeDocument[] | undefined } }) => number | false)
      | undefined;

    expect(typeof refetchInterval).toBe("function");
    const result1 = refetchInterval?.({
      state: { data: [buildDocument("processing")] },
    });
    expect(typeof result1).toBe("number");
    expect(result1!).toBe(3000);

    const result2 = refetchInterval?.({
      state: { data: [buildDocument("uploaded")] },
    });
    expect(typeof result2).toBe("number");
    expect(result2 as number).toBeGreaterThan(result1 as number);
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

    const result = refetchInterval?.({
      state: { data: [buildDocument("indexed")] },
    });
    expect(typeof result).toBe("number");
    expect(result!).toBe(3000);
  });

  it("polls the lightweight summary while hidden pending documents remain", () => {
    const options = documentListSummaryQueryOptions();
    const refetchInterval = options.refetchInterval as
      | ((query: { state: { data: { pending_count: number } | undefined } }) => number | false)
      | undefined;

    const result1 = refetchInterval?.({ state: { data: { pending_count: 1 } } });
    expect(typeof result1).toBe("number");
    expect(result1!).toBe(3000);
    expect(refetchInterval?.({ state: { data: { pending_count: 0 } } })).toBe(false);
  });
});
