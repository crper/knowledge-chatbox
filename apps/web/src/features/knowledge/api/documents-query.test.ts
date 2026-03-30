import { describe, expect, it } from "vite-plus/test";

import type { KnowledgeDocument } from "./documents";
import { documentsListQueryOptions } from "./documents-query";

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
});
