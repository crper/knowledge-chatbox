/**
 * @file 认证相关接口请求模块。
 */

import { i18n } from "@/i18n";
import { ApiRequestError, openapiRequestRequired } from "@/lib/api/client";
import { requestAccessTokenRefresh } from "@/lib/api/authenticated-fetch";
import type { AppUser } from "@/lib/api/client";
import { apiFetchClient } from "@/lib/api/generated/client";
import type { components } from "@/lib/api/generated/client";

const CURRENT_USER_REQUEST_TIMEOUT_MS = 3000;

type ChangePasswordRequest = components["schemas"]["ChangePasswordRequest"];
type LoginRequest = components["schemas"]["LoginRequest"];
type UpdatePreferencesRequest = components["schemas"]["UpdatePreferencesRequest"];

type AccessTokenEnvelope = {
  access_token: string;
  expires_in: number;
  token_type: "Bearer";
};

type LoginEnvelope = AccessTokenEnvelope & {
  user: AppUser;
};

type SessionBootstrapEnvelope = {
  authenticated: boolean;
  access_token: string | null;
  expires_in: number | null;
  token_type: "Bearer";
  user: AppUser | null;
};

/**
 * 获取当前用户。
 */
export async function getCurrentUser() {
  const controller = new AbortController();
  const timeoutId = globalThis.setTimeout(
    () => controller.abort(),
    CURRENT_USER_REQUEST_TIMEOUT_MS,
  );

  try {
    return await openapiRequestRequired<AppUser>(
      apiFetchClient.GET("/api/auth/me", { signal: controller.signal }),
    );
  } catch (error) {
    // AbortError 或超时转换为超时错误
    const isAbort =
      (error instanceof DOMException && error.name === "AbortError") ||
      (error instanceof ApiRequestError && error.status === 504);

    if (isAbort) {
      throw new ApiRequestError(i18n.t("apiErrorGatewayTimeout", { ns: "common" }), {
        kind: "timeout",
        retryable: true,
        status: 504,
      });
    }

    if (error instanceof ApiRequestError && (error.status === 401 || error.status === 403)) {
      return null;
    }

    throw error;
  } finally {
    globalThis.clearTimeout(timeoutId);
  }
}

export async function login(input: { username: string; password: string }) {
  const body: LoginRequest = input;
  return openapiRequestRequired<LoginEnvelope>(apiFetchClient.POST("/api/auth/login", { body }));
}

/**
 * 刷新 access token。
 */
export async function refreshSession() {
  return requestAccessTokenRefresh();
}

/**
 * 启动期恢复 refresh session；匿名态返回 null，不把它当成异常。
 */
export async function bootstrapAuthSession() {
  const result = await openapiRequestRequired<SessionBootstrapEnvelope>(
    apiFetchClient.POST("/api/auth/bootstrap"),
  );

  if (!result.authenticated || !result.access_token || !result.user) {
    return null;
  }

  return result;
}

export async function logout() {
  return await openapiRequestRequired<{ status: string }>(apiFetchClient.POST("/api/auth/logout"));
}

export function changePassword(input: { currentPassword: string; newPassword: string }) {
  const body: ChangePasswordRequest = {
    current_password: input.currentPassword,
    new_password: input.newPassword,
  };
  return openapiRequestRequired<AppUser>(
    apiFetchClient.POST("/api/auth/change-password", { body }),
  );
}

/**
 * 更新Preferences。
 */
export function updatePreferences(input: { themePreference: "light" | "dark" | "system" }) {
  const body: UpdatePreferencesRequest = {
    theme_preference: input.themePreference,
  };
  return openapiRequestRequired<AppUser>(apiFetchClient.PATCH("/api/auth/preferences", { body }));
}
