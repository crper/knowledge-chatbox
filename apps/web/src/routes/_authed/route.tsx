/**
 * @file TanStack Router 受保护工作区壳层路由。
 */

import { createFileRoute, redirect } from "@tanstack/react-router";

import { buildCurrentAuthRedirectTarget, buildLoginPath } from "@/lib/auth/auth-redirect";
import { ProtectedLayout } from "@/router/route-shells";
import { useSessionStore } from "@/lib/auth/session-store";

export const Route = createFileRoute("/_authed")({
  beforeLoad: ({ location }) => {
    const { status } = useSessionStore.getState();

    if (status === "anonymous" || status === "expired") {
      throw redirect({
        to: buildLoginPath(buildCurrentAuthRedirectTarget(location)),
      });
    }
  },
  component: ProtectedLayout,
});
