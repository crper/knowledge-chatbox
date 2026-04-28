/**
 * @file 用户查询配置模块。
 */

import { mutationOptions, queryOptions, type QueryClient } from "@tanstack/react-query";

import { queryKeys } from "@/lib/api/query-keys";
import { createUser, deleteUser, getUsers, resetUserPassword, updateUser } from "./users";

async function invalidateUsers(queryClient: QueryClient) {
  await queryClient.invalidateQueries({ queryKey: queryKeys.users.all });
}

/**
 * 获取用户列表查询配置。
 */
export function usersListQueryOptions() {
  return queryOptions({
    queryKey: queryKeys.users.list,
    queryFn: getUsers,
    staleTime: 60_000,
  });
}

/**
 * 获取创建用户变更配置。
 */
export function createUserMutationOptions(queryClient: QueryClient) {
  return mutationOptions({
    mutationFn: createUser,
    onSuccess: async () => {
      await invalidateUsers(queryClient);
    },
  });
}

/**
 * 获取更新用户变更配置。
 */
export function updateUserMutationOptions(queryClient: QueryClient) {
  return mutationOptions({
    mutationFn: ({ input, userId }: { input: Parameters<typeof updateUser>[1]; userId: number }) =>
      updateUser(userId, input),
    onSuccess: async () => {
      await invalidateUsers(queryClient);
    },
  });
}

/**
 * 获取重置密码变更配置。
 */
export function resetUserPasswordMutationOptions(queryClient: QueryClient) {
  return mutationOptions({
    mutationFn: ({ password, userId }: { password: string; userId: number }) =>
      resetUserPassword(userId, password),
    onSuccess: async () => {
      await invalidateUsers(queryClient);
    },
  });
}

/**
 * 获取删除用户变更配置。
 */
export function deleteUserMutationOptions(queryClient: QueryClient) {
  return mutationOptions({
    mutationFn: deleteUser,
    onSuccess: async () => {
      await invalidateUsers(queryClient);
    },
  });
}
