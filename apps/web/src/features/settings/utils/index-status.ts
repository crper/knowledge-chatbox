/**
 * @file 设置索引状态显示工具。
 */

import type { IndexRebuildStatus } from "../api/settings";

const INDEX_STATUS_LABEL_KEYS: Record<IndexRebuildStatus | "idle", string> = {
  running: "indexStatusRunning",
  failed: "indexStatusFailed",
  idle: "indexStatusIdle",
};

export function getIndexStatusLabel(
  status: IndexRebuildStatus | undefined,
  t: (key: string, params?: Record<string, unknown>) => string,
) {
  return t(INDEX_STATUS_LABEL_KEYS[status ?? "idle"]);
}
