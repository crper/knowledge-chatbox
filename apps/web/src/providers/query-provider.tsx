/**
 * @file 查询 Provider 模块。
 */

import { useState } from "react";
import type { PropsWithChildren } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

import { ApiRequestError } from "@/lib/api/client";

/**
 * 为子树提供 TanStack Query 上下文。
 */
export function QueryProvider({ children }: PropsWithChildren) {
  const [client] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            retry: (failureCount, error) => {
              if (!(error instanceof ApiRequestError)) {
                return failureCount < 2;
              }

              if (!error.retryable) {
                return false;
              }

              return failureCount < 2;
            },
            refetchOnWindowFocus: false,
          },
        },
      }),
  );

  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}
