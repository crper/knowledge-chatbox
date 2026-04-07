import { render, screen } from "@testing-library/react";

import { useLocation, useParams, useSearchParams } from "@/lib/app-router";
import { TestRouter } from "./test-router";

function RouteProbe() {
  const location = useLocation();
  const { sessionId } = useParams<{ sessionId?: string }>();
  const [searchParams] = useSearchParams();

  return (
    <div>
      <span data-testid="pathname">{location.pathname}</span>
      <span data-testid="session-id">{sessionId ?? "missing"}</span>
      <span data-testid="tab">{searchParams.get("tab") ?? "missing"}</span>
    </div>
  );
}

describe("TestRouter", () => {
  it("provides params and search values for an explicit route pattern", async () => {
    render(
      <TestRouter initialEntry="/chat/7?tab=context" path="/chat/:sessionId">
        <RouteProbe />
      </TestRouter>,
    );

    expect(await screen.findByTestId("pathname")).toHaveTextContent("/chat/7");
    expect(screen.getByTestId("session-id")).toHaveTextContent("7");
    expect(screen.getByTestId("tab")).toHaveTextContent("context");
  });

  it("derives a static route path from initialEntry when no pattern is provided", async () => {
    render(
      <TestRouter initialEntry="/settings/security?tab=profile">
        <RouteProbe />
      </TestRouter>,
    );

    expect(await screen.findByTestId("pathname")).toHaveTextContent("/settings/security");
    expect(screen.getByTestId("session-id")).toHaveTextContent("missing");
    expect(screen.getByTestId("tab")).toHaveTextContent("profile");
  });
});
