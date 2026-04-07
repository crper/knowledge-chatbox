import { render, screen } from "@testing-library/react";
import type { ReactNode } from "react";

import {
  TanStackDevtoolsProvider,
  type TanStackDevtoolsModules,
  shouldEnableTanStackDevtools,
} from "./tanstack-devtools-provider";

describe("shouldEnableTanStackDevtools", () => {
  it("enables devtools only for non-test development environments", () => {
    expect(shouldEnableTanStackDevtools({ isDev: true, isVitest: false })).toBe(true);
    expect(shouldEnableTanStackDevtools({ isDev: true, isVitest: true })).toBe(false);
    expect(shouldEnableTanStackDevtools({ isDev: false, isVitest: false })).toBe(false);
  });
});

describe("TanStackDevtoolsProvider", () => {
  it("does not load devtools modules when disabled", () => {
    const loadModules = vi.fn();

    const { container } = render(
      <TanStackDevtoolsProvider enabled={false} loadModules={loadModules} />,
    );

    expect(container).toBeEmptyDOMElement();
    expect(loadModules).not.toHaveBeenCalled();
  });

  it("loads query, router, and form panels together when enabled", async () => {
    const loadModules = vi.fn(async () => ({
      FormDevtoolsPanel: () => <div>form-panel</div>,
      ReactQueryDevtoolsPanel: () => <div>query-panel</div>,
      TanStackDevtools: ({
        plugins,
      }: {
        plugins: Array<{ id?: string; name: string | ReactNode }>;
      }) => (
        <div data-testid="tanstack-devtools">
          {plugins
            .map((plugin) => (typeof plugin.name === "string" ? plugin.name : "custom"))
            .join(",")}
        </div>
      ),
      TanStackRouterDevtoolsPanel: () => <div>router-panel</div>,
      formDevtoolsPlugin: () => ({
        id: "tanstack-form",
        name: "TanStack Form",
        render: <div>form-panel</div>,
      }),
    })) as unknown as () => Promise<TanStackDevtoolsModules>;

    render(<TanStackDevtoolsProvider enabled loadModules={loadModules} />);

    expect(await screen.findByTestId("tanstack-devtools")).toHaveTextContent(
      "TanStack Query,TanStack Router,TanStack Form",
    );
    expect(loadModules).toHaveBeenCalledTimes(1);
  });
});
