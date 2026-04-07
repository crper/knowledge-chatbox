/**
 * @file TanStack Router 受保护工作区壳层路由。
 */

import { createFileRoute, redirect } from "@tanstack/react-router";

import { ProtectedLayout } from "@/router/route-shells";
import { useSessionStore } from "@/lib/auth/session-store";

export const Route = createFileRoute("/_authed")({
  beforeLoad: ({ location }) => {
    const { setRedirectTo, status } = useSessionStore.getState();

    if (status === "anonymous" || status === "expired") {
      setRedirectTo(location.href);
      throw redirect({ to: "/login" });
    }
  },
  component: ProtectedLayout,
});
