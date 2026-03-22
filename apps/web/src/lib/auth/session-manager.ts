/**
 * @file 会话编排模块。
 */

import type { QueryClient } from "@tanstack/react-query";

import { getCurrentUser, refreshSession } from "@/features/auth/api/auth";
import { ApiRequestError } from "@/lib/api/client";
import { queryKeys } from "@/lib/api/query-keys";
import { clearAccessToken, getAccessToken } from "./token-store";
import { useSessionStore } from "./session-store";

/**
 * 启动时恢复当前会话状态。
 */
export async function bootstrapSession(queryClient: QueryClient) {
  try {
    if (!getAccessToken()) {
      await refreshSession();
    }
  } catch (error) {
    if (error instanceof ApiRequestError && error.status === 401) {
      markSessionAnonymous();
      return null;
    }

    throw error;
  }

  const user = await queryClient.fetchQuery({
    gcTime: 5 * 60 * 1000,
    queryFn: getCurrentUser,
    queryKey: queryKeys.auth.me,
    retry: false,
    staleTime: 60 * 1000,
  });

  useSessionStore.getState().setStatus(user ? "authenticated" : "anonymous");
  return user;
}

/**
 * 标记当前会话已登录。
 */
export function markSessionAuthenticated() {
  useSessionStore.getState().setStatus("authenticated");
}

/**
 * 标记当前会话未登录。
 */
export function markSessionAnonymous() {
  clearAccessToken();
  useSessionStore.getState().setStatus("anonymous");
}

/**
 * 标记当前会话已失效。
 */
export function markSessionExpired() {
  clearAccessToken();
  useSessionStore.getState().setStatus("expired");
}

/**
 * 标记当前认证服务处于降级状态。
 */
export function markSessionDegraded() {
  useSessionStore.getState().setStatus("degraded");
}
