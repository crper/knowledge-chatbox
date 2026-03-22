/**
 * @file 认证相关接口请求模块。
 */

import { ApiRequestError, openapiRequestRequired } from "@/lib/api/client";
import { requestAccessTokenRefresh } from "@/lib/api/authenticated-fetch";
import { clearAccessToken, setAccessToken } from "@/lib/auth/token-store";
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
    if (error instanceof ApiRequestError && (error.status === 401 || error.status === 403)) {
      return null;
    }

    throw error;
  } finally {
    globalThis.clearTimeout(timeoutId);
  }
}

/**
 * 定义登录。
 */
export async function login(input: { username: string; password: string }) {
  const body: LoginRequest = input;
  const result = await openapiRequestRequired<LoginEnvelope>(
    apiFetchClient.POST("/api/auth/login", { body }),
  );
  setAccessToken(result.access_token);
  return {
    accessToken: result.access_token,
    expiresIn: result.expires_in,
    user: result.user,
  };
}

/**
 * 刷新 access token。
 */
export async function refreshSession() {
  const accessToken = await requestAccessTokenRefresh();
  setAccessToken(accessToken);
  return accessToken;
}

/**
 * 定义登出。
 */
export async function logout() {
  try {
    return await openapiRequestRequired<{ status: string }>(
      apiFetchClient.POST("/api/auth/logout"),
    );
  } finally {
    clearAccessToken();
  }
}

/**
 * 定义修改密码。
 */
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
