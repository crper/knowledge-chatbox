import { createFileRoute } from "@tanstack/react-router";

import { lazy, Suspense } from "react";
import { LoadingState } from "@/components/shared/loading-state";

const GraphPage = lazy(async () => ({
  default: (await import("@/pages/graph/graph-page")).GraphPage,
}));

export const Route = createFileRoute("/_authed/graph/")({
  component: () => (
    <Suspense fallback={<LoadingState />}>
      <GraphPage />
    </Suspense>
  ),
  pendingComponent: LoadingState,
});
