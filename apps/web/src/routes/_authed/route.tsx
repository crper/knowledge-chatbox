import { createFileRoute, redirect, useRouteContext } from "@tanstack/react-router";

import { buildCurrentAuthRedirectTarget, buildLoginPath } from "@/lib/auth/auth-redirect";
import { useSessionStore } from "@/lib/auth/session-store";
import { fetchCurrentUserIfAuthenticated } from "@/features/auth/api/auth-query";
import { markSessionExpired } from "@/lib/auth/session-manager";
import { lazy, Suspense } from "react";
import { LoadingState } from "@/components/shared/loading-state";

const AppShellLayout = lazy(async () => ({
  default: (await import("@/layouts/app-shell-layout")).AppShellLayout,
}));

export function AuthedLayout() {
  const { user } = useRouteContext({ from: "/_authed" });
  return (
    <Suspense fallback={<LoadingState />}>
      <AppShellLayout user={user!} />
    </Suspense>
  );
}

export const Route = createFileRoute("/_authed")({
  beforeLoad: async ({ context, location }) => {
    const { status } = useSessionStore.getState();

    if (status === "anonymous" || status === "expired") {
      throw redirect({
        to: buildLoginPath(buildCurrentAuthRedirectTarget(location)),
      });
    }

    if (status === "degraded") {
      throw redirect({
        to: buildLoginPath(buildCurrentAuthRedirectTarget(location)),
      });
    }

    if (status === "bootstrapping") {
      return;
    }

    const user = await fetchCurrentUserIfAuthenticated(context.queryClient);
    if (!user) {
      markSessionExpired();
      throw redirect({
        to: buildLoginPath(buildCurrentAuthRedirectTarget(location)),
      });
    }

    return { user };
  },
  component: AuthedLayout,
});
