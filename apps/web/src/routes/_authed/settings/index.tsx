/**
 * @file TanStack Router settings 入口重定向。
 */

import { createFileRoute, redirect } from "@tanstack/react-router";

import { fetchCurrentUserIfAuthenticated } from "@/features/auth/api/auth-query";
import { buildSettingsPath } from "@/lib/routes";
import { resolveSettingsSection } from "@/features/settings/settings-sections";

export const Route = createFileRoute("/_authed/settings/")({
  validateSearch: (search: Record<string, unknown>) => ({
    section: typeof search.section === "string" ? search.section : null,
  }),
  beforeLoad: async ({ context, search }) => {
    const user = await fetchCurrentUserIfAuthenticated(context.queryClient);
    if (!user) {
      return;
    }

    const section = resolveSettingsSection(search.section, user);

    throw redirect({ to: buildSettingsPath(section) });
  },
});
