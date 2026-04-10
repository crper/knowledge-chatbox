/**
 * @file 聊天附件文件地址工具。
 */

import { buildApiUrl } from "@/lib/api/client";

export function getDocumentFileUrl(documentVersionId: number) {
  return buildApiUrl(`/api/documents/revisions/${documentVersionId}/file`);
}
