import type { QueryClient } from "@tanstack/react-query";
import { Outlet, createRootRouteWithContext } from "@tanstack/react-router";

import type { AppUser } from "@/lib/api/client";
import { ensureSessionBootstrap } from "@/lib/auth/session-manager";
import { useSessionStore } from "@/lib/auth/session-store";
import { AuthDegradedPage } from "@/pages/system/auth-degraded-page";
import { LoadingState } from "@/components/shared/loading-state";

export type RouterAppContext = {
  queryClient: QueryClient;
  user?: AppUser;
};

function RootRouteComponent() {
  const status = useSessionStore((state) => state.status);
  const reset = useSessionStore((state) => state.reset);

  if (status === "degraded") {
    return (
      <AuthDegradedPage
        onRetry={() => {
          reset();
        }}
      />
    );
  }

  return <Outlet />;
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
  pendingComponent: LoadingState,
});
