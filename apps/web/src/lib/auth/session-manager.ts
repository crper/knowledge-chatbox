/**
 * @file 会话编排模块。
 */

import type { QueryClient } from "@tanstack/react-query";

import { currentUserQueryOptions } from "@/features/auth/api/auth-query";
import { bootstrapAuthSession } from "@/features/auth/api/auth";
import { resetChatSessionState } from "@/features/chat/utils/reset-chat-session-state";
import { ApiRequestError, type AppUser } from "@/lib/api/client";
import { queryKeys } from "@/lib/api/query-keys";
import { clearAccessToken, getAccessToken } from "./token-store";
import { useSessionStore } from "./session-store";

const SESSION_SCOPED_QUERY_KEYS = [
  queryKeys.auth.all,
  queryKeys.chat.all,
  queryKeys.documents.all,
  queryKeys.settings.all,
  queryKeys.users.all,
] as const;

type ResetSessionScopedClientStateOptions = {
  preserveChatRecovery?: boolean;
};

type EnsureSessionBootstrapOptions = {
  isLoginPage?: boolean;
};

let pendingBootstrapPromise: Promise<AppUser | null> | null = null;

export async function resetSessionScopedClientState(
  queryClient: QueryClient,
  options: ResetSessionScopedClientStateOptions = {},
) {
  await Promise.all(
    SESSION_SCOPED_QUERY_KEYS.map(async (queryKey) => {
      await queryClient.cancelQueries({ queryKey });
      queryClient.removeQueries({ queryKey });
    }),
  );
  if (!options.preserveChatRecovery) {
    resetChatSessionState();
  }
}

async function applyAuthenticatedSession(
  queryClient: QueryClient,
  user: AppUser,
  options: ResetSessionScopedClientStateOptions = {},
) {
  await resetSessionScopedClientState(queryClient, options);
  queryClient.setQueryData(queryKeys.auth.me, user);
  useSessionStore.getState().setStatus("authenticated");
}

export async function setAuthenticatedSession(queryClient: QueryClient, user: AppUser) {
  await applyAuthenticatedSession(queryClient, user);
}

export async function logoutSession(queryClient: QueryClient) {
  await resetSessionScopedClientState(queryClient);
  markSessionAnonymous();
}

export async function expireSession(queryClient: QueryClient) {
  await resetSessionScopedClientState(queryClient);
  markSessionExpired();
}

/**
 * 启动时恢复当前会话状态。
 */
export async function bootstrapSession(queryClient: QueryClient) {
  if (!getAccessToken()) {
    try {
      const restored = await bootstrapAuthSession();
      if (!restored) {
        markSessionAnonymous();
        return null;
      }

      await applyAuthenticatedSession(queryClient, restored.user, {
        preserveChatRecovery: true,
      });
      return restored.user;
    } catch (error) {
      if (error instanceof ApiRequestError && error.status === 401) {
        markSessionAnonymous();
        return null;
      }

      throw error;
    }
  }

  const user = await queryClient.fetchQuery({
    ...currentUserQueryOptions(),
    gcTime: 5 * 60 * 1000,
    retry: false,
  });

  useSessionStore.getState().setStatus(user ? "authenticated" : "anonymous");
  return user;
}

export async function ensureSessionBootstrap(
  queryClient: QueryClient,
  options: EnsureSessionBootstrapOptions = {},
) {
  if (useSessionStore.getState().status !== "bootstrapping") {
    return null;
  }

  if (pendingBootstrapPromise === null) {
    pendingBootstrapPromise = bootstrapSession(queryClient)
      .catch(() => {
        if (options.isLoginPage) {
          markSessionAnonymous();
          return null;
        }

        markSessionDegraded();
        return null;
      })
      .finally(() => {
        pendingBootstrapPromise = null;
      });
  }

  return pendingBootstrapPromise;
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
