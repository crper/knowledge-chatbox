/**
 * @file 会话启动门禁模块。
 */

import { useEffect } from "react";
import type { PropsWithChildren } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { useLocation } from "@/lib/app-router";

import { ensureSessionBootstrap, markSessionAnonymous } from "@/lib/auth/session-manager";
import { useSessionStore } from "@/lib/auth/session-store";
import { AuthDegradedPage } from "@/pages/system/auth-degraded-page";

function LoadingState() {
  const { t } = useTranslation("common");

  return <div className="p-6 text-sm text-muted-foreground">{t("loading")}</div>;
}

/**
 * 在路由渲染前恢复会话状态。
 */
export function AppBootstrapGate({ children }: PropsWithChildren) {
  const location = useLocation();
  const queryClient = useQueryClient();
  const status = useSessionStore((state) => state.status);
  const reset = useSessionStore((state) => state.reset);

  const isLoginPage = location.pathname === "/login";

  useEffect(() => {
    if (status !== "bootstrapping") {
      return;
    }

    let cancelled = false;

    void ensureSessionBootstrap(queryClient, { isLoginPage }).then(() => {
      if (cancelled || !isLoginPage) {
        return;
      }

      if (useSessionStore.getState().status === "degraded") {
        markSessionAnonymous();
      }
    });

    return () => {
      cancelled = true;
    };
  }, [isLoginPage, queryClient, status]);

  if (status === "bootstrapping" && !isLoginPage) {
    return <LoadingState />;
  }

  if (status === "degraded" && !isLoginPage) {
    return (
      <AuthDegradedPage
        onRetry={() => {
          reset();
        }}
      />
    );
  }

  return children;
}
