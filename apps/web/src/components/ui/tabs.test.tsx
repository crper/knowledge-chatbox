import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vite-plus/test";

import { Tabs, TabsIndicator, TabsList, TabsPanel, TabsTab } from "./tabs";

function renderTabs() {
  render(
    <Tabs defaultValue="details">
      <TabsList>
        <TabsTab value="details">详情</TabsTab>
        <TabsTab value="versions">版本</TabsTab>
        <TabsIndicator />
      </TabsList>
      <TabsPanel value="details">详情面板</TabsPanel>
      <TabsPanel value="versions">版本面板</TabsPanel>
    </Tabs>,
  );
}

describe("Tabs", () => {
  it("switches tab panels when tab triggers are clicked", () => {
    renderTabs();

    expect(screen.getByRole("tabpanel", { name: "详情" })).toHaveTextContent("详情面板");

    fireEvent.click(screen.getByRole("tab", { name: "版本" }));

    expect(screen.getByRole("tabpanel", { name: "版本" })).toHaveTextContent("版本面板");
  });

  it("supports keyboard roving focus between tab triggers", () => {
    renderTabs();

    const detailsTab = screen.getByRole("tab", { name: "详情" });
    const versionsTab = screen.getByRole("tab", { name: "版本" });

    detailsTab.focus();
    fireEvent.keyDown(detailsTab, { code: "ArrowRight", key: "ArrowRight" });

    expect(versionsTab).toHaveAttribute("tabindex", "0");
  });
});
