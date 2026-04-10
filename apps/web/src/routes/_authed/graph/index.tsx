/**
 * @file TanStack Router graph 路由。
 */

import { createFileRoute } from "@tanstack/react-router";

import { GraphPageRoute } from "@/router/route-shells";

export const Route = createFileRoute("/_authed/graph/")({
  component: GraphPageRoute,
});
