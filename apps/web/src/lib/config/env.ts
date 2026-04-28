/**
 * @file 前端配置模块。
 */

type NormalizeApiBaseUrlOptions = {
  isDev?: boolean;
};

const DEV_PROXY_HOSTS = new Set(["localhost", "127.0.0.1"]);

function shouldPreferDevProxy(raw: string, isDev: boolean) {
  if (!isDev) {
    return false;
  }

  try {
    const url = new URL(raw);
    return DEV_PROXY_HOSTS.has(url.hostname) && url.port === "8000";
  } catch {
    return false;
  }
}

export function normalizeApiBaseUrl(
  value: string | undefined,
  options: NormalizeApiBaseUrlOptions = {},
) {
  const raw = value?.trim() ?? "";
  if (!raw) {
    return "";
  }

  if (raw === "/api") {
    return "";
  }

  const normalized = raw.endsWith("/api") ? raw.slice(0, -4) : raw;

  if (shouldPreferDevProxy(normalized, options.isDev ?? false)) {
    return "";
  }

  return normalized;
}

/**
 * 解析 API 请求的完整 base URL。
 * 优先使用 env.apiBaseUrl，其次使用当前页面 origin，兜底 http://localhost。
 */
export function resolveApiBaseUrl(apiBaseUrl: string = env.apiBaseUrl): string {
  if (apiBaseUrl) {
    return apiBaseUrl;
  }

  if (typeof globalThis.location?.origin === "string" && globalThis.location.origin) {
    return globalThis.location.origin;
  }

  return "http://localhost";
}

/**
 * 拼接 API 路径与 base URL，返回完整的请求 URL。
 */
export function buildApiUrl(path: string, apiBaseUrl: string = env.apiBaseUrl) {
  const base = resolveApiBaseUrl(apiBaseUrl);
  if (!base) {
    return path;
  }
  return `${base}${path}`;
}

/**
 * 暴露前端运行时环境变量。
 */
export const env = {
  apiBaseUrl: normalizeApiBaseUrl(import.meta.env.VITE_API_BASE_URL, {
    isDev: import.meta.env.DEV && !import.meta.env.VITEST,
  }),
};
