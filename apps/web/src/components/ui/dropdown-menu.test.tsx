import * as React from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vite-plus/test";

import { Button } from "./button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLinkItem,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "./dropdown-menu";

function RenderPropMenu({ onValueChange }: { onValueChange?: (value: string) => void }) {
  const [value, setValue] = React.useState("light");

  return (
    <DropdownMenu>
      <DropdownMenuTrigger render={<Button variant="outline" />}>主题</DropdownMenuTrigger>
      <DropdownMenuContent>
        <DropdownMenuRadioGroup
          onValueChange={(nextValue) => {
            setValue(nextValue);
            onValueChange?.(nextValue);
          }}
          value={value}
        >
          <DropdownMenuRadioItem value="light">浅色</DropdownMenuRadioItem>
          <DropdownMenuRadioItem value="dark">深色</DropdownMenuRadioItem>
          <DropdownMenuRadioItem value="system">跟随系统</DropdownMenuRadioItem>
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function RenderLinkMenu() {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger render={<Button variant="outline" />}>更多</DropdownMenuTrigger>
      <DropdownMenuContent>
        <DropdownMenuLinkItem render={<a href="#settings" />}>系统设置</DropdownMenuLinkItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

describe("DropdownMenu", () => {
  it("supports Base UI style render composition on the trigger, updates radio selection, and closes after selection", async () => {
    const onValueChange = vi.fn();

    render(<RenderPropMenu onValueChange={onValueChange} />);

    fireEvent.click(screen.getByRole("button", { name: "主题" }));

    expect(screen.getByRole("menuitemradio", { name: "浅色" })).toHaveAttribute(
      "aria-checked",
      "true",
    );

    fireEvent.click(screen.getByRole("menuitemradio", { name: "深色" }));

    expect(onValueChange).toHaveBeenCalledWith("dark");
    await waitFor(() => expect(screen.queryByRole("menu")).not.toBeInTheDocument());
  });

  it("closes by default after selecting a link item", async () => {
    render(<RenderLinkMenu />);

    fireEvent.click(screen.getByRole("button", { name: "更多" }));
    fireEvent.click(screen.getByRole("menuitem", { name: "系统设置" }));

    await waitFor(() => expect(screen.queryByRole("menu")).not.toBeInTheDocument());
  });
});
