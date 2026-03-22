import { describe, expect, it } from "vite-plus/test";

import { createTestQueryClient } from "./query-client";

describe("test/query-client", () => {
  it("disables query and mutation retries by default", () => {
    const queryClient = createTestQueryClient();
    const defaultOptions = queryClient.getDefaultOptions();

    expect(defaultOptions.queries).toMatchObject({ retry: false });
    expect(defaultOptions.mutations).toMatchObject({ retry: false });
  });

  it("merges custom query defaults without dropping the baseline safety settings", () => {
    const queryClient = createTestQueryClient({
      defaultOptions: {
        queries: {
          gcTime: 1_000,
          refetchOnWindowFocus: false,
        },
      },
    });
    const defaultOptions = queryClient.getDefaultOptions();

    expect(defaultOptions.queries).toMatchObject({
      retry: false,
      gcTime: 1_000,
      refetchOnWindowFocus: false,
    });
    expect(defaultOptions.mutations).toMatchObject({ retry: false });
  });

  it("allows explicit retry overrides for targeted tests", () => {
    const queryClient = createTestQueryClient({
      defaultOptions: {
        queries: { retry: 2 },
        mutations: { retry: 1 },
      },
    });
    const defaultOptions = queryClient.getDefaultOptions();

    expect(defaultOptions.queries).toMatchObject({ retry: 2 });
    expect(defaultOptions.mutations).toMatchObject({ retry: 1 });
  });
});
