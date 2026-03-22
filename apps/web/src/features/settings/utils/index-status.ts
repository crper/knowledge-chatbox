/**
 * @file 设置索引状态显示工具。
 */

import type { IndexRebuildStatus } from "../api/settings";

export function getIndexStatusLabel(
  status: IndexRebuildStatus | undefined,
  t: (key: string, params?: Record<string, unknown>) => string,
) {
  if (status === "running") {
    return t("indexStatusRunning");
  }

  if (status === "failed") {
    return t("indexStatusFailed");
  }

  return t("indexStatusIdle");
}
