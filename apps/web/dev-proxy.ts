const DEFAULT_DEV_API_PROXY_PORT = "8000";

export function resolveDevApiProxyTarget(env: Record<string, string | undefined>) {
  const apiPort = env.API_PORT?.trim();
  const resolvedPort = apiPort && /^\d+$/.test(apiPort) ? apiPort : DEFAULT_DEV_API_PROXY_PORT;

  return `http://localhost:${resolvedPort}`;
}
