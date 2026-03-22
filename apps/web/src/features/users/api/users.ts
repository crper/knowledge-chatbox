/**
 * @file 用户相关接口请求模块。
 */

import { openapiRequestRequired } from "@/lib/api/client";
import { apiFetchClient } from "@/lib/api/generated/client";
import type { components } from "@/lib/api/generated/client";

/**
 * 描述用户项的数据结构。
 */
export type UserItem = {
  id: number;
  username: string;
  role: "admin" | "user";
  status: "active" | "disabled";
  theme_preference?: "light" | "dark" | "system";
  created_at?: string;
  created_by_user_id?: number | null;
  updated_at?: string;
  last_login_at?: string | null;
  password_changed_at?: string | null;
};
type CreateUserRequest = components["schemas"]["CreateUserRequest"];
type ResetPasswordRequest = components["schemas"]["ResetPasswordRequest"];
type UpdateUserRequest = components["schemas"]["UpdateUserRequest"];

/**
 * 获取用户。
 */
export function getUsers() {
  return openapiRequestRequired<UserItem[]>(apiFetchClient.GET("/api/users"));
}

/**
 * 创建用户。
 */
export function createUser(input: { username: string; password: string; role: "admin" | "user" }) {
  const body: CreateUserRequest = input;
  return openapiRequestRequired<UserItem>(apiFetchClient.POST("/api/users", { body }));
}

/**
 * 更新用户。
 */
export function updateUser(userId: number, input: Partial<Pick<UserItem, "status" | "role">>) {
  return openapiRequestRequired<UserItem>(
    apiFetchClient.PATCH("/api/users/{user_id}", {
      params: { path: { user_id: userId } },
      body: input as UpdateUserRequest,
    }),
  );
}

/**
 * 重置用户密码。
 */
export function resetUserPassword(userId: number, newPassword: string) {
  const body: ResetPasswordRequest = { new_password: newPassword };
  return openapiRequestRequired<UserItem>(
    apiFetchClient.POST("/api/users/{user_id}/reset-password", {
      params: { path: { user_id: userId } },
      body,
    }),
  );
}

/**
 * 删除用户。
 */
export function deleteUser(userId: number) {
  return openapiRequestRequired<{ status: string }>(
    apiFetchClient.DELETE("/api/users/{user_id}", {
      params: { path: { user_id: userId } },
    }),
  );
}
