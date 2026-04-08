/**
 * @file TanStack Router 登录路由。
 */

import { createFileRoute, redirect } from "@tanstack/react-router";

import { resolvePostLoginPath } from "@/lib/auth/auth-redirect";
import { PublicLoginRoute } from "@/router/route-shells";
import { useSessionStore } from "@/lib/auth/session-store";

export const Route = createFileRoute("/login")({
  beforeLoad: ({ location }) => {
    if (useSessionStore.getState().status === "authenticated") {
      throw redirect({ to: resolvePostLoginPath(location.search) });
    }
  },
  component: PublicLoginRoute,
});
