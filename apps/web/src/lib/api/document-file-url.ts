/**
 * @file 文档文件地址工具。
 */

import { buildApiUrl } from "@/lib/config/env";

export function getDocumentFileUrl(documentVersionId: number) {
  return buildApiUrl(`/api/documents/revisions/${documentVersionId}/file`);
}
