import { createFileRoute, redirect } from "@tanstack/react-router";

import { CHAT_INDEX_PATH } from "@/lib/routes";
import { sanitizeAuthRedirectPath } from "@/lib/auth/auth-redirect";
import { useSessionStore } from "@/lib/auth/session-store";
import { lazy, Suspense } from "react";
import { LoadingState } from "@/components/shared/loading-state";

const LoginPage = lazy(async () => ({
  default: (await import("@/pages/auth/login-page")).LoginPage,
}));

export const Route = createFileRoute("/login")({
  validateSearch: (search: Record<string, unknown>) => ({
    redirect: typeof search.redirect === "string" ? search.redirect : undefined,
  }),
  beforeLoad: ({ search }) => {
    const { status } = useSessionStore.getState();
    if (status === "authenticated") {
      const redirectTo = sanitizeAuthRedirectPath(search.redirect) ?? CHAT_INDEX_PATH;
      throw redirect({ to: redirectTo });
    }
  },
  component: () => (
    <Suspense fallback={<LoadingState />}>
      <LoginPage />
    </Suspense>
  ),
});
