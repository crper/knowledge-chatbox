/**
 * @file TanStack Router 薄适配层。
 */

import { useCallback, useMemo } from "react";
import {
  Link as TanStackLink,
  Navigate as TanStackNavigate,
  Outlet as TanStackOutlet,
  useLocation as useTanStackLocation,
  useNavigate as useTanStackNavigate,
  useParams as useTanStackParams,
  useSearch as useTanStackSearch,
} from "@tanstack/react-router";

type AppLocation = {
  hash: string;
  pathname: string;
  search: string;
};

function stringifySearchValue(value: unknown) {
  if (value == null) {
    return null;
  }

  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }

  return JSON.stringify(value);
}

export const Link = TanStackLink;
export const NavLink = TanStackLink;
export const Navigate = TanStackNavigate;
export const Outlet = TanStackOutlet;

export function useLocation(): AppLocation {
  const location = useTanStackLocation();
  const search =
    typeof location.search === "string"
      ? location.search
      : (() => {
          const params = new URLSearchParams();

          Object.entries(location.search ?? {}).forEach(([key, value]) => {
            const normalizedValue = stringifySearchValue(value);
            if (normalizedValue == null) {
              return;
            }
            params.set(key, normalizedValue);
          });

          const serialized = params.toString();
          return serialized.length > 0 ? `?${serialized}` : "";
        })();

  return {
    hash: location.hash,
    pathname: location.pathname,
    search,
  };
}

export function useNavigate() {
  const navigate = useTanStackNavigate();

  return useCallback(
    (to: string, options?: { replace?: boolean }) => navigate({ replace: options?.replace, to }),
    [navigate],
  );
}

export function useParams<TParams extends Record<string, string | undefined>>() {
  return useTanStackParams({ strict: false } as never) as TParams;
}

export function useSearchParams() {
  const search = useTanStackSearch({ strict: false });
  const searchParams = useMemo(() => {
    const params = new URLSearchParams();

    Object.entries(search ?? {}).forEach(([key, value]) => {
      const normalizedValue = stringifySearchValue(value);
      if (normalizedValue == null) {
        return;
      }
      params.set(key, normalizedValue);
    });

    return params;
  }, [search]);

  return [searchParams, () => {}] as const;
}
