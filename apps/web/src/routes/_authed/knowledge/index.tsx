import { createFileRoute } from "@tanstack/react-router";

import {
  documentsListQueryOptions,
  documentUploadReadinessQueryOptions,
} from "@/features/knowledge/api/documents-query";
import { normalizeKnowledgeRouteSearch } from "@/features/knowledge/route-search";
import { lazy, Suspense } from "react";
import { LoadingState } from "@/components/shared/loading-state";

const KnowledgePage = lazy(async () => ({
  default: (await import("@/pages/knowledge/knowledge-page")).KnowledgePage,
}));

export const Route = createFileRoute("/_authed/knowledge/")({
  validateSearch: (search: Record<string, unknown>) => normalizeKnowledgeRouteSearch(search),
  loaderDeps: ({ search }) => search,
  loader: async ({ context, deps }) => {
    await Promise.all([
      context.queryClient.ensureQueryData(documentUploadReadinessQueryOptions()),
      context.queryClient.ensureQueryData(documentsListQueryOptions(deps)),
    ]);
  },
  component: () => (
    <Suspense fallback={<LoadingState />}>
      <KnowledgePage />
    </Suspense>
  ),
  pendingComponent: LoadingState,
});
