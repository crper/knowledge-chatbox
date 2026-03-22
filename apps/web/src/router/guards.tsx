/**
 * @file 路由守卫模块。
 */

import { useEffect, type PropsWithChildren } from "react";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { Navigate, useLocation } from "react-router-dom";

import { currentUserQueryOptions } from "@/features/auth/api/auth-query";
import { AuthDegradedPage } from "@/pages/system/auth-degraded-page";
import { ForbiddenPage } from "@/pages/system/forbidden-page";
import { useSessionStore } from "@/lib/auth/session-store";

function LoadingState() {
  const { t } = useTranslation("common");

  return <div className="p-6 text-sm text-muted-foreground">{t("loading")}</div>;
}

/**
 * 只允许匿名用户访问的路由守卫。
 */
export function PublicRoute({ children }: PropsWithChildren) {
  const status = useSessionStore((state) => state.status);

  if (status === "authenticated") {
    return <Navigate replace to="/chat" />;
  }

  return children;
}

/**
 * 只允许已登录用户访问的路由守卫。
 */
export function ProtectedRoute({ children }: PropsWithChildren) {
  const location = useLocation();
  const status = useSessionStore((state) => state.status);
  const setRedirectTo = useSessionStore((state) => state.setRedirectTo);

  useEffect(() => {
    if (status !== "anonymous" && status !== "expired") {
      return;
    }

    setRedirectTo(`${location.pathname}${location.search}${location.hash}`);
  }, [location.hash, location.pathname, location.search, setRedirectTo, status]);

  if (status === "bootstrapping") {
    return <LoadingState />;
  }

  if (status === "degraded") {
    return <AuthDegradedPage />;
  }

  if (status === "anonymous" || status === "expired") {
    return <Navigate replace to="/login" />;
  }

  return children;
}

/**
 * 基于用户角色的路由守卫。
 */
export function RoleRoute({ children, role }: PropsWithChildren<{ role: "admin" | "user" }>) {
  const currentUserQuery = useQuery({
    ...currentUserQueryOptions(),
    retry: false,
  });

  if (currentUserQuery.isPending) {
    return <LoadingState />;
  }

  if (!currentUserQuery.data || currentUserQuery.data.role !== role) {
    return <ForbiddenPage />;
  }

  return children;
}
