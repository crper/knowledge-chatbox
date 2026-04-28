import { createFileRoute, redirect } from "@tanstack/react-router";

import { resolveSettingsSection } from "@/features/settings/settings-sections";

export const Route = createFileRoute("/_authed/settings/")({
  validateSearch: (search: Record<string, unknown>) => ({
    section: typeof search.section === "string" ? search.section : null,
  }),
  beforeLoad: ({ context, search }) => {
    const user = context.user;
    if (!user) {
      return;
    }

    const section = resolveSettingsSection(search.section, user);

    throw redirect({ to: "/settings/$section", params: { section } });
  },
});
