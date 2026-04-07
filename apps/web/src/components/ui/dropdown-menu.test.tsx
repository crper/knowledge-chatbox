import * as React from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vite-plus/test";

import { Button } from "./button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
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

function SizedMenu() {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger render={<Button variant="outline" />}>更多</DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-72 min-w-72">
        <DropdownMenuRadioGroup onValueChange={() => {}} value="light">
          <DropdownMenuRadioItem value="light">浅色</DropdownMenuRadioItem>
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function PlainMenu() {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger render={<Button variant="outline" />}>操作</DropdownMenuTrigger>
      <DropdownMenuContent>
        <DropdownMenuItem>系统设置</DropdownMenuItem>
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

  it("applies caller sizing classes on the positioned wrapper so end-aligned menus do not drift", () => {
    render(<SizedMenu />);

    fireEvent.click(screen.getByRole("button", { name: "更多" }));

    const menu = screen.getByRole("menu");
    const positioner = menu.parentElement;

    expect(positioner).not.toBeNull();
    expect(positioner?.className).toContain("w-72");
    expect(positioner?.className).toContain("min-w-72");
  });

  it("renders plain menu items directly in the popup instead of inserting an extra viewport wrapper", () => {
    render(<PlainMenu />);

    fireEvent.click(screen.getByRole("button", { name: "操作" }));

    const menu = screen.getByRole("menu");

    expect(menu.firstElementChild).toHaveAttribute("role", "menuitem");
  });
});
