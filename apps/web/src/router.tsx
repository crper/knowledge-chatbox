/**
 * @file 前端模块。
 */

import { useQuery } from "@tanstack/react-query";
import { Navigate, Route, Routes } from "react-router-dom";

import { currentUserQueryOptions } from "@/features/auth/api/auth-query";
import { AppShellLayout } from "@/layouts/app-shell-layout";
import { LoginPage } from "@/pages/auth/login-page";
import { ChatPage } from "@/pages/chat/chat-page";
import { KnowledgePage } from "@/pages/knowledge/knowledge-page";
import { SettingsPage } from "@/pages/settings/settings-page";
import { ForbiddenPage } from "@/pages/system/forbidden-page";
import { UsersPage } from "@/pages/users/users-page";
import { AppBootstrapGate } from "@/router/bootstrap-gate";
import { ProtectedRoute, PublicRoute, RoleRoute } from "@/router/guards";

function ProtectedLayout() {
  const currentUserQuery = useQuery({
    ...currentUserQueryOptions(),
    retry: false,
  });

  if (!currentUserQuery.data) {
    return null;
  }

  return <AppShellLayout user={currentUserQuery.data} />;
}

function SettingsRoute() {
  const currentUserQuery = useQuery({
    ...currentUserQueryOptions(),
    retry: false,
  });

  if (!currentUserQuery.data) {
    return null;
  }

  return <SettingsPage user={currentUserQuery.data} />;
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
