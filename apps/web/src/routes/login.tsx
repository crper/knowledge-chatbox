/**
 * @file TanStack Router 登录路由。
 */

import { createFileRoute, redirect } from "@tanstack/react-router";

import { PublicLoginRoute } from "@/router/route-shells";
import { useSessionStore } from "@/lib/auth/session-store";

export const Route = createFileRoute("/login")({
  beforeLoad: () => {
    if (useSessionStore.getState().status === "authenticated") {
      throw redirect({ to: "/chat" });
    }
  },
  component: PublicLoginRoute,
});
