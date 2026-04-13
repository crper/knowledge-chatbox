import { createFileRoute, redirect, useRouteContext } from "@tanstack/react-router";

import { resolveSettingsSection } from "@/features/settings/settings-sections";
import { lazy, Suspense } from "react";
import { LoadingState } from "@/components/shared/loading-state";

const SettingsPage = lazy(async () => ({
  default: (await import("@/pages/settings/settings-page")).SettingsPage,
}));

function SettingsPageWithUser() {
  const { user } = useRouteContext({ from: "/_authed/settings/$section" });
  return (
    <Suspense fallback={<LoadingState />}>
      <SettingsPage user={user!} />
    </Suspense>
  );
}

export const Route = createFileRoute("/_authed/settings/$section")({
  beforeLoad: ({ context, params }) => {
    const user = context.user;
    if (!user) {
      return;
    }

    const nextSection = resolveSettingsSection(params.section, user);
    if (nextSection !== params.section) {
      throw redirect({ to: "/settings/$section", params: { section: nextSection } });
    }
  },
  component: SettingsPageWithUser,
  pendingComponent: LoadingState,
});
