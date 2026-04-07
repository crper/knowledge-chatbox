/**
 * @file TanStack Router 受保护根入口。
 */

import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/_authed/")({
  beforeLoad: () => {
    throw redirect({ to: "/chat" });
  },
});
