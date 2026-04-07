import { describe, expect, it } from "vite-plus/test";

import { normalizeKnowledgeRouteSearch } from "./route-search";

describe("knowledge route search", () => {
  it("normalizes whitespace and drops unsupported filter values", () => {
    expect(
      normalizeKnowledgeRouteSearch({
        query: "  guide  ",
        status: "weird",
        type: "zip",
      }),
    ).toEqual({
      query: "guide",
    });
  });

  it("keeps supported type and status filters", () => {
    expect(
      normalizeKnowledgeRouteSearch({
        query: "spec",
        status: "indexed",
        type: "pdf",
      }),
    ).toEqual({
      query: "spec",
      status: "indexed",
      type: "pdf",
    });
  });
});
