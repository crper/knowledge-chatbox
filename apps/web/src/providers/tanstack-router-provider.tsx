/**
 * @file TanStack Router Provider 模块。
 */

import { useEffect, useMemo, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { RouterProvider } from "@tanstack/react-router";

import { useSessionStore } from "@/lib/auth/session-store";
import { createAppRouter } from "@/tanstack-router";
import { TanStackDevtoolsProvider } from "./tanstack-devtools-provider";

/**
 * 为后续 runtime cutover 准备的 TanStack Router Provider。
 */
export function TanStackRouterProvider() {
  const queryClient = useQueryClient();
  const status = useSessionStore((state) => state.status);
  const router = useMemo(() => createAppRouter(queryClient), [queryClient]);

  const prevStatusRef = useRef(status);
  useEffect(() => {
    if (prevStatusRef.current !== status) {
      prevStatusRef.current = status;
      void router.invalidate();
    }
  }, [router, status]);

  return (
    <>
      <RouterProvider context={{ queryClient }} router={router} />
      <TanStackDevtoolsProvider queryClient={queryClient} router={router} />
    </>
  );
}
