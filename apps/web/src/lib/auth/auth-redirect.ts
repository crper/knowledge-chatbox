import { CHAT_INDEX_PATH, LOGIN_PATH } from "@/lib/routes";

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

function toSearchParams(search: string | Record<string, unknown> | URLSearchParams | undefined) {
  if (!search) {
    return new URLSearchParams();
  }

  if (search instanceof URLSearchParams) {
    return search;
  }

  if (typeof search === "string") {
    return new URLSearchParams(search.startsWith("?") ? search.slice(1) : search);
  }

  const searchParams = new URLSearchParams();
  const redirectValue = search[AUTH_REDIRECT_PARAM];
  if (typeof redirectValue === "string") {
    searchParams.set(AUTH_REDIRECT_PARAM, redirectValue);
  }
  return searchParams;
}

function stringifySearch(search: string | Record<string, unknown> | URLSearchParams | undefined) {
  if (!search) {
    return "";
  }

  if (typeof search === "string") {
    return search;
  }

  const serialized = toSearchParams(search).toString();
  return serialized ? `?${serialized}` : "";
}

export function readAuthRedirectFromSearch(
  search: string | Record<string, unknown> | URLSearchParams | undefined,
) {
  return sanitizeAuthRedirectPath(toSearchParams(search).get(AUTH_REDIRECT_PARAM));
}

export function resolvePostLoginPath(
  search: string | Record<string, unknown> | URLSearchParams | undefined,
) {
  return readAuthRedirectFromSearch(search) ?? CHAT_INDEX_PATH;
}

export function buildCurrentAuthRedirectTarget(location: {
  hash?: string;
  href?: string;
  pathname?: string;
  search?: string | Record<string, unknown> | URLSearchParams;
}) {
  const pathname = typeof location.pathname === "string" ? location.pathname : "";
  const hash = typeof location.hash === "string" ? location.hash : "";
  const candidate = `${pathname}${stringifySearch(location.search)}${hash}`;

  return sanitizeAuthRedirectPath(candidate) ?? sanitizeAuthRedirectPath(location.href) ?? null;
}
