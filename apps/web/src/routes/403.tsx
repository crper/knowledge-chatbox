/**
 * @file TanStack Router 无权限路由。
 */

import { createFileRoute } from "@tanstack/react-router";

import { ForbiddenPage } from "@/pages/system/forbidden-page";

export const Route = createFileRoute("/403")({
  component: ForbiddenPage,
});
