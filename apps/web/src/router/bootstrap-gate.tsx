/**
 * @file 会话启动门禁模块。
 */

import type { PropsWithChildren } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useLocation } from "@/lib/app-router";

import { ensureSessionBootstrap, markSessionAnonymous } from "@/lib/auth/session-manager";
import { useSessionStore } from "@/lib/auth/session-store";
import { AuthDegradedPage } from "@/pages/system/auth-degraded-page";
import { LoadingState } from "@/components/shared/loading-state";

/**
 * 在路由渲染前恢复会话状态。
 */
export function AppBootstrapGate({ children }: PropsWithChildren) {
  const location = useLocation();
  const queryClient = useQueryClient();
  const status = useSessionStore((state) => state.status);
  const reset = useSessionStore((state) => state.reset);

  const isLoginPage = location.pathname === "/login";

  if (status === "bootstrapping" && !isLoginPage) {
    return <LoadingState />;
  }

  if (status === "degraded" && !isLoginPage) {
    return (
      <AuthDegradedPage
        onRetry={() => {
          reset();
          void ensureSessionBootstrap(queryClient, { isLoginPage }).then(() => {
            if (isLoginPage && useSessionStore.getState().status === "degraded") {
              markSessionAnonymous();
            }
          });
        }}
      />
    );
  }

  return children;
}
