import { render, screen } from "@testing-library/react";

import { ChatDesktopShell, ChatMobileShell, StandardDesktopShell } from "./app-shell-layout-shells";

describe("app-shell-layout-shells", () => {
  it("renders the desktop chat shell slots and collapsed expand handle", () => {
    render(
      <ChatDesktopShell
        contextPanel={<div>Context Panel</div>}
        expandSidebarLabel="Expand sessions"
        gridTemplate="4.75rem 0 1fr 22rem"
        onExpandSidebar={() => {}}
        sidebar={<div>Session Sidebar</div>}
        sidebarCollapsed
        workspaceRail={<div>Workspace Rail</div>}
      >
        <div>Main Chat Content</div>
      </ChatDesktopShell>,
    );

    expect(screen.getByTestId("chat-desktop-layout")).toBeInTheDocument();
    expect(screen.getByText("Workspace Rail")).toBeInTheDocument();
    expect(screen.queryByText("Session Sidebar")).not.toBeInTheDocument();
    expect(screen.getByText("Main Chat Content")).toBeInTheDocument();
    expect(screen.getByText("Context Panel")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Expand sessions" })).toBeInTheDocument();
  });

  it("renders the mobile chat shell with open navigation and context drawers", () => {
    render(
      <ChatMobileShell
        children={<div>Mobile Chat Content</div>}
        contextActionLabel="Open context"
        contextDescription="Context description"
        contextOpen
        contextPanel={<div>Mobile Context Panel</div>}
        contextTitle="Context"
        navigation={<div>Mobile Navigation</div>}
        navigationActionLabel="Open navigation"
        navigationDescription="Navigation description"
        navigationOpen
        navigationTitle="Navigation"
        onContextOpenChange={() => {}}
        onNavigationOpenChange={() => {}}
        workspaceLabel="Chat"
      />,
    );

    expect(screen.getByText("Chat")).toBeInTheDocument();
    expect(screen.getByText("Navigation")).toBeInTheDocument();
    expect(screen.getByText("Mobile Navigation")).toBeInTheDocument();
    expect(screen.getByText("Context")).toBeInTheDocument();
    expect(screen.getByText("Mobile Context Panel")).toBeInTheDocument();
    expect(screen.getByText("Mobile Chat Content")).toBeInTheDocument();
  });

  it("renders the standard desktop shell with an optional settings sidebar", () => {
    render(
      <StandardDesktopShell
        contentRailTestId="content-rail"
        isSettingsRoute
        sidebar={<div>Settings Sidebar</div>}
        workspaceRail={<div>Workspace Rail</div>}
      >
        <div>Settings Content</div>
      </StandardDesktopShell>,
    );

    expect(screen.getByTestId("standard-desktop-layout")).toBeInTheDocument();
    expect(screen.getByText("Workspace Rail")).toBeInTheDocument();
    expect(screen.getByText("Settings Sidebar")).toBeInTheDocument();
    expect(screen.getByTestId("content-rail")).toBeInTheDocument();
    expect(screen.getByText("Settings Content")).toBeInTheDocument();
  });
});
