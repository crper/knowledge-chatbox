import * as React from "react";
import { render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vite-plus/test";

import { Sheet, SheetContent } from "./sheet";

vi.mock("@base-ui/react/drawer", () => {
  const Root = ({
    children,
    swipeDirection,
  }: {
    children?: React.ReactNode;
    swipeDirection?: string;
  }) => (
    <div data-swipe-direction={swipeDirection} data-testid="drawer-root">
      {children}
    </div>
  );

  const Trigger = ({
    children,
    render,
    ...props
  }: {
    children?: React.ReactNode;
    render?: React.ReactElement;
  }) =>
    render ? React.cloneElement(render, props, children) : <button {...props}>{children}</button>;

  const Close = ({
    children,
    render,
    ...props
  }: {
    children?: React.ReactNode;
    render?: React.ReactElement;
  }) =>
    render ? React.cloneElement(render, props, children) : <button {...props}>{children}</button>;

  const simple = (testId: string) =>
    function Simple({
      children,
      ...props
    }: React.HTMLAttributes<HTMLDivElement> & { children?: React.ReactNode }) {
      return (
        <div data-testid={testId} {...props}>
          {children}
        </div>
      );
    };

  return {
    Drawer: {
      Root,
      Trigger,
      Close,
      Portal: ({ children }: { children?: React.ReactNode }) => <>{children}</>,
      Backdrop: simple("drawer-backdrop"),
      Viewport: simple("drawer-viewport"),
      Popup: simple("drawer-popup"),
      Content: simple("drawer-content"),
      Title: simple("drawer-title"),
      Description: simple("drawer-description"),
    },
  };
});

describe("Sheet", () => {
  it("derives drawer swipe direction from SheetContent side", async () => {
    render(
      <Sheet open={true}>
        <SheetContent side="left">sidebar</SheetContent>
      </Sheet>,
    );

    await waitFor(() => {
      expect(screen.getByTestId("drawer-root")).toHaveAttribute("data-swipe-direction", "left");
    });
  });
});
