/**
 * @file TanStack Router 根路由 smoke 配置。
 */

import type { QueryClient } from "@tanstack/react-query";
import { Outlet, createRootRouteWithContext } from "@tanstack/react-router";

import { ensureSessionBootstrap } from "@/lib/auth/session-manager";
import { AppBootstrapGate } from "@/router/bootstrap-gate";

export type RouterAppContext = {
  queryClient: QueryClient;
};

function RootRouteComponent() {
  return (
    <AppBootstrapGate>
      <Outlet />
    </AppBootstrapGate>
  );
}

function NotFoundRouteComponent() {
  return null;
}

export const Route = createRootRouteWithContext<RouterAppContext>()({
  beforeLoad: async ({ context, location }) => {
    await ensureSessionBootstrap(context.queryClient, {
      isLoginPage: location.pathname === "/login",
    });
  },
  component: RootRouteComponent,
  notFoundComponent: NotFoundRouteComponent,
});
