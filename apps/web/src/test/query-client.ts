/**
 * @file 测试用 QueryClient helper。
 */

import { QueryClient, type QueryClientConfig } from "@tanstack/react-query";

export function createTestQueryClient(config: QueryClientConfig = {}) {
  const { defaultOptions, ...restConfig } = config;

  return new QueryClient({
    ...restConfig,
    defaultOptions: {
      ...defaultOptions,
      mutations: {
        retry: false,
        ...defaultOptions?.mutations,
      },
      queries: {
        retry: false,
        ...defaultOptions?.queries,
      },
    },
  });
}
