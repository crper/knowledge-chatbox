/**
 * @file 设置查询配置模块。
 */

import { mutationOptions, queryOptions, type QueryClient } from "@tanstack/react-query";

import { queryKeys } from "@/lib/api/query-keys";
import { getSettings, testProviderConnection, updateSettings } from "./settings";

/**
 * 获取设置详情查询配置。
 */
export function settingsDetailQueryOptions(enabled = true) {
  return queryOptions({
    enabled,
    queryKey: queryKeys.settings.detail,
    queryFn: getSettings,
  });
}

/**
 * 获取设置更新变更配置。
 */
export function updateSettingsMutationOptions(queryClient: QueryClient) {
  return mutationOptions({
    mutationFn: updateSettings,
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: queryKeys.settings.all });
      await queryClient.invalidateQueries({ queryKey: queryKeys.chat.profile });
    },
  });
}

/**
 * 获取 provider 测试变更配置。
 */
export function testProviderConnectionMutationOptions() {
  return mutationOptions({
    mutationFn: testProviderConnection,
  });
}
