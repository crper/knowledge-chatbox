/**
 * @file 前端配置模块。
 */

export function normalizeApiBaseUrl(value: string | undefined) {
  const raw = value?.trim() ?? "";
  if (!raw) {
    return "";
  }

  if (raw === "/api") {
    return "";
  }

  if (raw.endsWith("/api")) {
    return raw.slice(0, -4);
  }

  return raw;
}

/**
 * 暴露前端运行时环境变量。
 */
export const env = {
  apiBaseUrl: normalizeApiBaseUrl(import.meta.env.VITE_API_BASE_URL),
};
