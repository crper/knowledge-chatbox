/**
 * @file 前端模块。
 */

import { useEffect, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { Navigate, Route, Routes } from "react-router-dom";

import { currentUserQueryOptions } from "@/features/auth/api/auth-query";
import type { AppUser } from "@/lib/api/client";
import { useSessionStore } from "@/lib/auth/session-store";
import { markSessionExpired } from "@/lib/auth/session-manager";
import { AppShellLayout } from "@/layouts/app-shell-layout";
import { LoginPage } from "@/pages/auth/login-page";
import { ChatPage } from "@/pages/chat/chat-page";
import { KnowledgePage } from "@/pages/knowledge/knowledge-page";
import { SettingsPage } from "@/pages/settings/settings-page";
import { AuthDegradedPage } from "@/pages/system/auth-degraded-page";
import { ForbiddenPage } from "@/pages/system/forbidden-page";
import { UsersPage } from "@/pages/users/users-page";
import { AppBootstrapGate } from "@/router/bootstrap-gate";
import { ProtectedRoute, PublicRoute, RoleRoute } from "@/router/guards";

function LoadingState() {
  const { t } = useTranslation("common");

  return <div className="p-6 text-sm text-muted-foreground">{t("loading")}</div>;
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
  return <CurrentUserBoundary>{(user) => <AppShellLayout user={user} />}</CurrentUserBoundary>;
}

function SettingsRoute() {
  return <CurrentUserBoundary>{(user) => <SettingsPage user={user} />}</CurrentUserBoundary>;
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
          <Route path="/knowledge" element={<KnowledgePage />} />
          <Route path="/chat" element={<ChatPage />} />
          <Route path="/chat/:sessionId" element={<ChatPage />} />
          <Route path="/settings" element={<SettingsRoute />} />
          <Route
            path="/users"
            element={
              <RoleRoute role="admin">
                <UsersPage />
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
