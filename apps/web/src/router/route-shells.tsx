/**
 * @file 路由壳层共享模块。
 */

import { lazy, Suspense, useEffect, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";

import { currentUserQueryOptions } from "@/features/auth/api/auth-query";
import type { AppUser } from "@/lib/api/client";
import { buildLoginPath } from "@/lib/auth/auth-redirect";
import { useLocation, useNavigate, Navigate } from "@/lib/app-router";
import { markSessionExpired } from "@/lib/auth/session-manager";
import { useSessionStore } from "@/lib/auth/session-store";
import { AuthDegradedPage } from "@/pages/system/auth-degraded-page";

const AppShellLayout = lazy(async () => ({
  default: (await import("@/layouts/app-shell-layout")).AppShellLayout,
}));
const LoginPage = lazy(async () => ({
  default: (await import("@/pages/auth/login-page")).LoginPage,
}));
const ChatPage = lazy(async () => ({
  default: (await import("@/pages/chat/chat-page")).ChatPage,
}));
const KnowledgePage = lazy(async () => ({
  default: (await import("@/pages/knowledge/knowledge-page")).KnowledgePage,
}));
const SettingsPage = lazy(async () => ({
  default: (await import("@/pages/settings/settings-page")).SettingsPage,
}));
const UsersPage = lazy(async () => ({
  default: (await import("@/pages/users/users-page")).UsersPage,
}));

let pendingAuthRedirectPath: string | null = null;

export function LoadingState() {
  const { t } = useTranslation("common");

  return <div className="p-6 text-sm text-muted-foreground">{t("loading")}</div>;
}

export function RouteSuspense({ children }: { children: ReactNode }) {
  return <Suspense fallback={<LoadingState />}>{children}</Suspense>;
}

export function CurrentUserBoundary({ children }: { children: (user: AppUser) => ReactNode }) {
  const location = useLocation();
  const navigate = useNavigate();
  const status = useSessionStore((state) => state.status);
  const currentUserQuery = useQuery({
    ...currentUserQueryOptions(),
    enabled: status === "authenticated",
    retry: false,
  });
  const shouldRedirectToLogin = status === "anonymous" || status === "expired";
  const shouldExpireSession =
    status === "authenticated" && currentUserQuery.isSuccess && !currentUserQuery.data;
  const loginRedirectPath = buildLoginPath(
    `${location.pathname}${location.search}${location.hash}`,
  );

  useEffect(() => {
    if (!shouldExpireSession) {
      return;
    }

    markSessionExpired();
  }, [shouldExpireSession]);

  useEffect(() => {
    if (!shouldRedirectToLogin) {
      pendingAuthRedirectPath = null;
      return;
    }

    if (pendingAuthRedirectPath === loginRedirectPath) {
      return;
    }

    pendingAuthRedirectPath = loginRedirectPath;
    void navigate(loginRedirectPath, { replace: true });
  }, [loginRedirectPath, navigate, shouldRedirectToLogin]);

  if (shouldRedirectToLogin || shouldExpireSession) {
    return <LoadingState />;
  }

  if (currentUserQuery.isPending) {
    return <LoadingState />;
  }

  if (currentUserQuery.isError) {
    return <AuthDegradedPage />;
  }

  if (!currentUserQuery.data) {
    return <LoadingState />;
  }

  return children(currentUserQuery.data);
}

export function ProtectedLayout() {
  return (
    <CurrentUserBoundary>
      {(user) => (
        <RouteSuspense>
          <AppShellLayout user={user} />
        </RouteSuspense>
      )}
    </CurrentUserBoundary>
  );
}

export function SettingsPageRoute() {
  return (
    <CurrentUserBoundary>
      {(user) => (
        <RouteSuspense>
          <SettingsPage user={user} />
        </RouteSuspense>
      )}
    </CurrentUserBoundary>
  );
}

export function UsersPageRoute() {
  return (
    <CurrentUserBoundary>
      {() => (
        <RouteSuspense>
          <UsersPage />
        </RouteSuspense>
      )}
    </CurrentUserBoundary>
  );
}

export function PublicLoginRoute() {
  return (
    <RouteSuspense>
      <LoginPage />
    </RouteSuspense>
  );
}

export function ChatPageRoute() {
  return (
    <RouteSuspense>
      <ChatPage />
    </RouteSuspense>
  );
}

export function KnowledgePageRoute() {
  return (
    <RouteSuspense>
      <KnowledgePage />
    </RouteSuspense>
  );
}

export function AuthedIndexRedirectRoute() {
  return <Navigate replace to="/chat" />;
}
