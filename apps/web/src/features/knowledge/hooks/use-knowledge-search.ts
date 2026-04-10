import { useCallback, useDeferredValue, useEffect, useMemo, useState } from "react";

import { useNavigate, useSearch } from "@/lib/app-router";
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
  const search = useSearch<Record<string, unknown>>();
  const routeSearch = useMemo(() => normalizeKnowledgeRouteSearch(search), [search]);
  const routeQuery = routeSearch.query ?? "";
  const [searchValue, setSearchValue] = useState(routeQuery);
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

  useEffect(() => {
    setSearchValue((currentValue) => (currentValue === routeQuery ? currentValue : routeQuery));
  }, [routeQuery]);

  useEffect(() => {
    const nextQuery = deferredSearchValue.trim() || undefined;
    if ((routeSearch.query ?? undefined) === nextQuery) {
      return;
    }

    updateRouteSearch({ query: nextQuery }, { replace: true });
  }, [deferredSearchValue, routeSearch.query, updateRouteSearch]);

  return {
    deferredSearchValue,
    routeSearch,
    searchValue,
    setSearchValue,
    updateRouteSearch,
  };
}
