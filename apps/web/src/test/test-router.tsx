import { createContext, useContext, useMemo, type ReactNode } from "react";
import {
  Outlet,
  RouterProvider,
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
} from "@tanstack/react-router";

type TestRouterProps = {
  children: ReactNode;
  initialEntry?: string;
  path?: string;
};

const TestRouterContentContext = createContext<ReactNode>(null);

function TestRouterContent() {
  return <>{useContext(TestRouterContentContext)}</>;
}

function normalizeRoutePath(value: string) {
  return value.replace(/:([A-Za-z0-9_]+)/g, (_, paramName: string) => `$${paramName}`);
}

function resolveRoutePath(initialEntry: string, path?: string) {
  if (path) {
    return normalizeRoutePath(path);
  }

  const url = new URL(initialEntry, "http://localhost");
  return normalizeRoutePath(url.pathname || "/");
}

export function TestRouter({ children, initialEntry = "/", path }: TestRouterProps) {
  const routePath = resolveRoutePath(initialEntry, path);
  const history = useMemo(
    () =>
      createMemoryHistory({
        initialEntries: [initialEntry],
      }),
    [initialEntry],
  );
  const router = useMemo(() => {
    const rootRoute = createRootRoute({
      component: Outlet,
    });
    const testRoute = createRoute({
      component: TestRouterContent,
      getParentRoute: () => rootRoute,
      path: routePath,
    });

    return createRouter({
      history,
      routeTree: rootRoute.addChildren([testRoute]),
    });
  }, [history, routePath]);

  return (
    <TestRouterContentContext.Provider value={children}>
      <RouterProvider router={router} />
    </TestRouterContentContext.Provider>
  );
}
