import { createFileRoute, redirect } from "@tanstack/react-router";

import { lazy, Suspense } from "react";
import { LoadingState } from "@/components/shared/loading-state";

const UsersPage = lazy(async () => ({
  default: (await import("@/pages/users/users-page")).UsersPage,
}));

export const Route = createFileRoute("/_authed/admin/users")({
  beforeLoad: ({ context }) => {
    const user = context.user;
    if (!user) {
      return;
    }
    if (user.role !== "admin") {
      throw redirect({ to: "/403" });
    }
  },
  component: () => (
    <Suspense fallback={<LoadingState />}>
      <UsersPage />
    </Suspense>
  ),
  pendingComponent: LoadingState,
});
