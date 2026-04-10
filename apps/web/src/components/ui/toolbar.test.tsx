import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vite-plus/test";

import { Toolbar, ToolbarButton, ToolbarGroup, ToolbarSeparator } from "./toolbar";

describe("Toolbar", () => {
  it("renders toolbar groups and separator semantics", () => {
    render(
      <Toolbar>
        <ToolbarGroup>
          <ToolbarButton aria-label="搜索资源">搜索</ToolbarButton>
        </ToolbarGroup>
        <ToolbarSeparator />
        <ToolbarGroup>
          <ToolbarButton aria-label="上传资源">上传</ToolbarButton>
        </ToolbarGroup>
      </Toolbar>,
    );

    expect(screen.getByRole("toolbar")).toBeInTheDocument();
    expect(screen.getAllByRole("group")).toHaveLength(2);
    expect(screen.getByRole("separator")).toHaveAttribute("aria-orientation", "vertical");
    expect(screen.getByRole("button", { name: "搜索资源" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "上传资源" })).toBeInTheDocument();
  });
});
