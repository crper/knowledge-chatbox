/**
 * @file TanStack Router settings section 路由。
 */

import { createFileRoute, redirect } from "@tanstack/react-router";

import { fetchCurrentUserIfAuthenticated } from "@/features/auth/api/auth-query";
import { resolveSettingsSection } from "@/features/settings/settings-sections";
import { buildSettingsPath } from "@/lib/routes";
import { SettingsPageRoute } from "@/router/route-shells";

export const Route = createFileRoute("/_authed/settings/$section")({
  beforeLoad: async ({ context, params }) => {
    const user = await fetchCurrentUserIfAuthenticated(context.queryClient);
    if (!user) {
      return;
    }

    const nextSection = resolveSettingsSection(params.section, user);
    if (nextSection !== params.section) {
      throw redirect({ to: buildSettingsPath(nextSection) });
    }
  },
  component: SettingsPageRoute,
});
