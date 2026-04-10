/**
 * @file 受保护文件的打开与下载操作模块。
 */

import { fetchProtectedFileBlob } from "@/lib/api/protected-file";
import { triggerDownload } from "@/lib/dom";

const OBJECT_URL_REVOKE_DELAY_MS = 60_000;

async function resolveProtectedObjectUrl(fileUrl: string) {
  const blob = await fetchProtectedFileBlob(fileUrl);
  return URL.createObjectURL(blob);
}

function scheduleRevokeObjectUrl(objectUrl: string) {
  window.setTimeout(() => URL.revokeObjectURL(objectUrl), OBJECT_URL_REVOKE_DELAY_MS);
}

export async function openProtectedFile(fileUrl: string) {
  const objectUrl = await resolveProtectedObjectUrl(fileUrl);
  window.open(objectUrl, "_blank", "noopener,noreferrer");
  scheduleRevokeObjectUrl(objectUrl);
}

export async function downloadProtectedFile(fileUrl: string, filename: string) {
  const objectUrl = await resolveProtectedObjectUrl(fileUrl);
  triggerDownload(objectUrl, filename);
  scheduleRevokeObjectUrl(objectUrl);
}
