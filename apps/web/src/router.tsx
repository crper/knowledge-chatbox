/**
 * @file 前端模块。
 */

import { lazy, Suspense, useEffect, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { Navigate, Route, Routes } from "react-router-dom";

import { currentUserQueryOptions } from "@/features/auth/api/auth-query";
import type { AppUser } from "@/lib/api/client";
import { useSessionStore } from "@/lib/auth/session-store";
import { markSessionExpired } from "@/lib/auth/session-manager";
import { LoginPage } from "@/pages/auth/login-page";
import { AuthDegradedPage } from "@/pages/system/auth-degraded-page";
import { ForbiddenPage } from "@/pages/system/forbidden-page";
import { AppBootstrapGate } from "@/router/bootstrap-gate";
import { ProtectedRoute, PublicRoute, RoleRoute } from "@/router/guards";

const AppShellLayout = lazy(async () => ({
  default: (await import("@/layouts/app-shell-layout")).AppShellLayout,
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

function LoadingState() {
  const { t } = useTranslation("common");

  return <div className="p-6 text-sm text-muted-foreground">{t("loading")}</div>;
}

function RouteSuspense({ children }: { children: ReactNode }) {
  return <Suspense fallback={<LoadingState />}>{children}</Suspense>;
}

function CurrentUserBoundary({ children }: { children: (user: AppUser) => ReactNode }) {
  const status = useSessionStore((state) => state.status);
  const currentUserQuery = useQuery({
    ...currentUserQueryOptions(),
    retry: false,
  });
  const shouldExpireSession =
    status === "authenticated" && currentUserQuery.isSuccess && !currentUserQuery.data;

  useEffect(() => {
    if (!shouldExpireSession) {
      return;
    }

    markSessionExpired();
  }, [shouldExpireSession]);

  if (currentUserQuery.isPending || shouldExpireSession) {
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

function ProtectedLayout() {
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

function SettingsRoute() {
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

/**
 * 定义应用路由树。
 */
export function AppRouter() {
  return (
    <AppBootstrapGate>
      <Routes>
        <Route
          path="/login"
          element={
            <PublicRoute>
              <LoginPage />
            </PublicRoute>
          }
        />
        <Route
          element={
            <ProtectedRoute>
              <ProtectedLayout />
            </ProtectedRoute>
          }
        >
          <Route path="/" element={<Navigate replace to="/chat" />} />
          <Route
            path="/knowledge"
            element={
              <RouteSuspense>
                <KnowledgePage />
              </RouteSuspense>
            }
          />
          <Route
            path="/chat"
            element={
              <RouteSuspense>
                <ChatPage />
              </RouteSuspense>
            }
          />
          <Route
            path="/chat/:sessionId"
            element={
              <RouteSuspense>
                <ChatPage />
              </RouteSuspense>
            }
          />
          <Route path="/settings" element={<SettingsRoute />} />
          <Route
            path="/users"
            element={
              <RoleRoute role="admin">
                <RouteSuspense>
                  <UsersPage />
                </RouteSuspense>
              </RoleRoute>
            }
          />
        </Route>
        <Route path="/403" element={<ForbiddenPage />} />
        <Route path="*" element={<Navigate replace to="/chat" />} />
      </Routes>
    </AppBootstrapGate>
  );
}
