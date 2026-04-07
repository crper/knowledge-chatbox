/**
 * @file TanStack Router knowledge 路由。
 */

import { createFileRoute } from "@tanstack/react-router";

import {
  documentsListQueryOptions,
  documentUploadReadinessQueryOptions,
} from "@/features/knowledge/api/documents-query";
import { normalizeKnowledgeRouteSearch } from "@/features/knowledge/route-search";
import { KnowledgePageRoute } from "@/router/route-shells";

export const Route = createFileRoute("/_authed/knowledge/")({
  validateSearch: (search: Record<string, unknown>) => normalizeKnowledgeRouteSearch(search),
  loaderDeps: ({ search }) => search,
  loader: async ({ context, deps }) => {
    await Promise.all([
      context.queryClient.ensureQueryData(documentUploadReadinessQueryOptions()),
      context.queryClient.ensureQueryData(documentsListQueryOptions(deps)),
    ]);
  },
  component: KnowledgePageRoute,
});
