import { createFileRoute } from "@tanstack/react-router";

import { ForbiddenPage } from "@/pages/system/forbidden-page";

export const Route = createFileRoute("/403")({
  component: ForbiddenPage,
});
