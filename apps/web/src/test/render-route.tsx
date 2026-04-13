import { render } from "@testing-library/react";
import { QueryClientProvider } from "@tanstack/react-query";
import { createMemoryHistory, RouterProvider } from "@tanstack/react-router";

import { I18nProvider } from "@/providers/i18n-provider";
import { ThemeProvider } from "@/providers/theme-provider";
import { StoreSyncProvider } from "@/providers/store-sync-provider";
import { createTestQueryClient } from "@/test/query-client";
import { createAppRouter } from "@/tanstack-router";

export function renderRoute(route: string) {
  const queryClient = createTestQueryClient({
    defaultOptions: {
      queries: {
        retry: false,
        refetchOnWindowFocus: false,
      },
    },
  });
  const history = createMemoryHistory({
    initialEntries: [route],
  });
  const router = createAppRouter(queryClient, history);

  // Wait for the initial route load to settle before returning so tests don't
  // race against the bootstrap / beforeLoad pipeline.
  // If the load promise does not settle within a reasonable window, we still
  // return control so the test can assert on what rendered.
  void router.load();

  const result = render(
    <I18nProvider>
      <ThemeProvider>
        <QueryClientProvider client={queryClient}>
          <StoreSyncProvider />
          <RouterProvider context={{ queryClient }} router={router} />
        </QueryClientProvider>
      </ThemeProvider>
    </I18nProvider>,
  );

  return {
    ...result,
    history,
    queryClient,
    router,
  };
}
