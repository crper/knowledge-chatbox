/**
 * @file TanStack Router 实例工厂。
 */

import type { QueryClient } from "@tanstack/react-query";
import { createRouter, type RouterHistory } from "@tanstack/react-router";

import type { RouterAppContext } from "@/routes/__root";
import { routeTree } from "@/routeTree.gen";

export function createAppRouter(queryClient: QueryClient, history?: RouterHistory) {
  return createRouter({
    routeTree,
    context: {
      queryClient,
    } satisfies RouterAppContext,
    defaultPreload: "intent",
    history,
  });
}

declare module "@tanstack/react-router" {
  interface Register {
    router: ReturnType<typeof createAppRouter>;
  }
}
