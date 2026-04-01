/**
 * @file 设置查询配置模块。
 */

import { mutationOptions, queryOptions, type QueryClient } from "@tanstack/react-query";

import { queryKeys } from "@/lib/api/query-keys";
import type { AppSettings } from "./settings";
import { getSettings, testProviderConnection, updateSettings } from "./settings";

const SETTINGS_POLL_INTERVAL_MS = 3000;

function shouldPollSettings(enabled: boolean, settings: AppSettings | undefined) {
  return enabled && settings?.index_rebuild_status === "running";
}

/**
 * 获取设置详情查询配置。
 */
export function settingsDetailQueryOptions(enabled = true) {
  return queryOptions({
    enabled,
    queryKey: queryKeys.settings.detail,
    queryFn: getSettings,
    refetchInterval: (query) =>
      shouldPollSettings(enabled, query.state.data as AppSettings | undefined)
        ? SETTINGS_POLL_INTERVAL_MS
        : false,
  });
}

/**
 * 获取设置更新变更配置。
 */
export function updateSettingsMutationOptions(queryClient: QueryClient) {
  return mutationOptions({
    mutationFn: updateSettings,
    onSuccess: async (settings) => {
      queryClient.setQueryData(queryKeys.settings.detail, settings);
      await queryClient.invalidateQueries({
        queryKey: queryKeys.settings.all,
        refetchType: "none",
      });
      await queryClient.invalidateQueries({
        queryKey: queryKeys.documents.uploadReadiness,
        refetchType: "none",
      });
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
