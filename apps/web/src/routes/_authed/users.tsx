import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/_authed/users")({
  beforeLoad: ({ context }) => {
    const user = context.user;
    if (!user) {
      return;
    }
    throw redirect({ to: user.role === "admin" ? "/admin/users" : "/403" });
  },
});
