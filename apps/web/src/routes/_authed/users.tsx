/**
 * @file TanStack Router legacy users 入口。
 */

import { createFileRoute, redirect } from "@tanstack/react-router";

import { fetchCurrentUserIfAuthenticated } from "@/features/auth/api/auth-query";
import { ADMIN_USERS_PATH, FORBIDDEN_PATH } from "@/lib/routes";

export const Route = createFileRoute("/_authed/users")({
  beforeLoad: async ({ context }) => {
    const user = await fetchCurrentUserIfAuthenticated(context.queryClient);
    if (!user) {
      return;
    }
    throw redirect({ to: user?.role === "admin" ? ADMIN_USERS_PATH : FORBIDDEN_PATH });
  },
});
