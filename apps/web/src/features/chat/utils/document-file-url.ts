/**
 * @file 聊天附件文件地址工具。
 */

import { env } from "@/lib/config/env";

/**
 * 在开发环境优先走同源 `/api` 代理，避免 `localhost` / `127.0.0.1` 混用触发跨域。
 */
export function getDocumentFileUrl(documentVersionId: number) {
  const path = `/api/documents/revisions/${documentVersionId}/file`;

  if (import.meta.env.DEV || !env.apiBaseUrl) {
    return path;
  }

  return `${env.apiBaseUrl}${path}`;
}
