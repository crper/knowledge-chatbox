/**
 * @file 受保护文件读取工具模块。
 */

import { authenticatedFetch } from "./authenticated-fetch";

export async function fetchProtectedFile(url: string) {
  const response = await authenticatedFetch(url);

  if (!response.ok) {
    throw new Error("protected_file_request_failed");
  }

  return response;
}
