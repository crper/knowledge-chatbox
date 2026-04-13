import { useCallback, useDeferredValue, useMemo } from "react";

import { useNavigate, useSearch } from "@tanstack/react-router";
import { normalizeKnowledgeRouteSearch, type KnowledgeRouteSearch } from "../route-search";

type UseKnowledgeSearchResult = {
  deferredSearchValue: string;
  routeSearch: KnowledgeRouteSearch;
  searchValue: string;
  setSearchValue: (value: string) => void;
  updateRouteSearch: (
    patch: Partial<KnowledgeRouteSearch>,
    options?: { replace?: boolean },
  ) => void;
};

export function useKnowledgeSearch(): UseKnowledgeSearchResult {
  const navigate = useNavigate();
  const search = useSearch({ strict: false }) as Record<string, unknown>;
  const routeSearch = useMemo(() => normalizeKnowledgeRouteSearch(search), [search]);
  const searchValue = routeSearch.query ?? "";
  const deferredSearchValue = useDeferredValue(searchValue);

  const updateRouteSearch = useCallback(
    (patch: Partial<KnowledgeRouteSearch>, options?: { replace?: boolean }) => {
      void navigate({
        replace: options?.replace,
        search: normalizeKnowledgeRouteSearch({
          ...routeSearch,
          ...patch,
        }),
        to: "/knowledge",
      });
    },
    [navigate, routeSearch],
  );

  const setSearchValue = useCallback(
    (value: string) => {
      updateRouteSearch({ query: value || undefined }, { replace: true });
    },
    [updateRouteSearch],
  );

  return {
    deferredSearchValue,
    routeSearch,
    searchValue,
    setSearchValue,
    updateRouteSearch,
  };
}
