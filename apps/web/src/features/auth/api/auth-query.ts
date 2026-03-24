/**
 * @file 认证查询配置模块。
 */

import { mutationOptions, queryOptions, type QueryClient } from "@tanstack/react-query";

import { queryKeys } from "@/lib/api/query-keys";
import { changePassword, getCurrentUser, updatePreferences } from "./auth";

/**
 * 获取当前用户查询配置。
 */
export function currentUserQueryOptions() {
  return queryOptions({
    queryKey: queryKeys.auth.me,
    queryFn: getCurrentUser,
    staleTime: 60 * 1000,
  });
}

/**
 * 获取修改密码变更配置。
 */
export function changePasswordMutationOptions() {
  return mutationOptions({
    mutationFn: changePassword,
  });
}

/**
 * 获取偏好更新变更配置。
 */
export function updatePreferencesMutationOptions(queryClient: QueryClient) {
  return mutationOptions({
    mutationFn: updatePreferences,
    onSuccess: (nextUser) => {
      queryClient.setQueryData(queryKeys.auth.me, nextUser);
    },
  });
}
