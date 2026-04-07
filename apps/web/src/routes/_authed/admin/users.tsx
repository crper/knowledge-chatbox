/**
 * @file TanStack Router admin users 路由。
 */

import { createFileRoute, redirect } from "@tanstack/react-router";

import { fetchCurrentUserIfAuthenticated } from "@/features/auth/api/auth-query";
import { UsersPageRoute } from "@/router/route-shells";

export const Route = createFileRoute("/_authed/admin/users")({
  beforeLoad: async ({ context }) => {
    const user = await fetchCurrentUserIfAuthenticated(context.queryClient);
    if (!user) {
      return;
    }
    if (user.role !== "admin") {
      throw redirect({ to: "/403" });
    }
  },
  component: UsersPageRoute,
});
