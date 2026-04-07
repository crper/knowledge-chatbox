import { startTransition, useEffect, useMemo, useState } from "react";
import type { QueryClient } from "@tanstack/react-query";
import type { AnyRouter } from "@tanstack/react-router";

export type TanStackDevtoolsModules = {
  FormDevtoolsPanel: typeof import("@tanstack/react-form-devtools").FormDevtoolsPanel;
  ReactQueryDevtoolsPanel: typeof import("@tanstack/react-query-devtools").ReactQueryDevtoolsPanel;
  TanStackDevtools: typeof import("@tanstack/react-devtools").TanStackDevtools;
  TanStackRouterDevtoolsPanel: typeof import("@tanstack/react-router-devtools").TanStackRouterDevtoolsPanel;
  formDevtoolsPlugin: typeof import("@tanstack/react-form-devtools").formDevtoolsPlugin;
};

type TanStackDevtoolsProviderProps = {
  enabled?: boolean;
  loadModules?: () => Promise<TanStackDevtoolsModules>;
  queryClient?: QueryClient;
  router?: AnyRouter;
};

const loadTanStackDevtoolsModules: () => Promise<TanStackDevtoolsModules> =
  import.meta.env.DEV && !import.meta.env.VITEST
    ? () =>
        Promise.all([
          import("@tanstack/react-devtools"),
          import("@tanstack/react-query-devtools"),
          import("@tanstack/react-router-devtools"),
          import("@tanstack/react-form-devtools"),
        ]).then(
          ([
            { TanStackDevtools },
            { ReactQueryDevtoolsPanel },
            { TanStackRouterDevtoolsPanel },
            { FormDevtoolsPanel, formDevtoolsPlugin },
          ]) => ({
            FormDevtoolsPanel,
            ReactQueryDevtoolsPanel,
            TanStackDevtools,
            TanStackRouterDevtoolsPanel,
            formDevtoolsPlugin,
          }),
        )
    : () => Promise.reject(new Error("TanStack Devtools are disabled outside development."));

export function shouldEnableTanStackDevtools({
  isDev = import.meta.env.DEV,
  isVitest = import.meta.env.VITEST,
}: {
  isDev?: boolean;
  isVitest?: boolean;
} = {}) {
  return isDev && !isVitest;
}

export function TanStackDevtoolsProvider({
  enabled = shouldEnableTanStackDevtools(),
  loadModules = loadTanStackDevtoolsModules,
  queryClient,
  router,
}: TanStackDevtoolsProviderProps) {
  const [modules, setModules] = useState<TanStackDevtoolsModules | null>(null);

  useEffect(() => {
    if (!enabled) {
      return;
    }

    let active = true;
    void loadModules().then((resolvedModules) => {
      if (!active) {
        return;
      }

      startTransition(() => {
        setModules(resolvedModules);
      });
    });

    return () => {
      active = false;
    };
  }, [enabled, loadModules]);

  const plugins = useMemo(() => {
    if (!modules) {
      return null;
    }

    const queryPlugin = {
      id: "tanstack-query",
      name: "TanStack Query",
      render: <modules.ReactQueryDevtoolsPanel client={queryClient} />,
    };
    const routerPlugin = {
      id: "tanstack-router",
      name: "TanStack Router",
      render: <modules.TanStackRouterDevtoolsPanel router={router} />,
    };
    const formPlugin = modules.formDevtoolsPlugin();

    return [queryPlugin, routerPlugin, formPlugin];
  }, [modules, queryClient, router]);

  if (!enabled || !modules || !plugins) {
    return null;
  }

  const Devtools = modules.TanStackDevtools;

  return <Devtools plugins={plugins} />;
}
