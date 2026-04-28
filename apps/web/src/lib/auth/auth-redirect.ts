import { LOGIN_PATH } from "@/lib/routes";

export const AUTH_REDIRECT_PARAM = "redirect";

function isLoginRoutePath(path: string) {
  return (
    path === LOGIN_PATH || path.startsWith(`${LOGIN_PATH}?`) || path.startsWith(`${LOGIN_PATH}#`)
  );
}

export function sanitizeAuthRedirectPath(value: string | null | undefined) {
  if (typeof value !== "string") {
    return null;
  }

  const normalized = value.trim();
  if (!normalized.startsWith("/") || normalized.startsWith("//")) {
    return null;
  }
  if (isLoginRoutePath(normalized)) {
    return null;
  }

  return normalized;
}

export function buildLoginPath(redirectTo?: string | null) {
  const sanitizedRedirect = sanitizeAuthRedirectPath(redirectTo);
  if (!sanitizedRedirect) {
    return LOGIN_PATH;
  }

  const searchParams = new URLSearchParams({
    [AUTH_REDIRECT_PARAM]: sanitizedRedirect,
  });

  return `${LOGIN_PATH}?${searchParams.toString()}`;
}

export function buildCurrentAuthRedirectTarget(location: {
  hash?: string;
  href?: string;
  pathname?: string;
  search?: string | Record<string, unknown> | URLSearchParams;
}) {
  const pathname = typeof location.pathname === "string" ? location.pathname : "";
  const hash = typeof location.hash === "string" ? location.hash : "";

  let searchStr = "";
  if (typeof location.search === "string") {
    searchStr = location.search.startsWith("?") ? location.search : `?${location.search}`;
  } else if (location.search instanceof URLSearchParams) {
    const serialized = location.search.toString();
    searchStr = serialized ? `?${serialized}` : "";
  }

  const candidate = `${pathname}${searchStr}${hash}`;

  return sanitizeAuthRedirectPath(candidate) ?? sanitizeAuthRedirectPath(location.href) ?? null;
}
