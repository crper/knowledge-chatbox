import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vite-plus/test";

import { Button, buttonVariants } from "./button";

const CUSTOM_CHROME_FRAGMENTS = [
  "bg-[linear-gradient(",
  "shadow-[",
  "before:",
  "after:",
  "group/button",
];

describe("buttonVariants", () => {
  it("maps variants to a restrained modern button system without the old glossy chrome", () => {
    const defaultClasses = buttonVariants({ variant: "default" });
    const outlineClasses = buttonVariants({ variant: "outline" });
    const secondaryClasses = buttonVariants({ variant: "secondary" });
    const ghostClasses = buttonVariants({ variant: "ghost" });
    const destructiveClasses = buttonVariants({ variant: "destructive" });
    const linkClasses = buttonVariants({ variant: "link" });

    expect(defaultClasses).toContain("bg-foreground");
    expect(defaultClasses).toContain("text-background");
    expect(defaultClasses).toContain("rounded-xl");

    expect(outlineClasses).toContain("border-border");
    expect(outlineClasses).toContain("bg-background");
    expect(outlineClasses).toContain("text-foreground");

    expect(secondaryClasses).toContain("bg-secondary");
    expect(secondaryClasses).toContain("text-secondary-foreground");

    expect(ghostClasses).toContain("bg-transparent");
    expect(ghostClasses).toContain("text-muted-foreground");

    expect(destructiveClasses).toContain("bg-destructive");
    expect(destructiveClasses).toContain("text-white");

    expect(linkClasses).toContain("text-primary");
    expect(linkClasses).toContain("hover:underline");

    for (const classes of [
      defaultClasses,
      outlineClasses,
      secondaryClasses,
      ghostClasses,
      destructiveClasses,
      linkClasses,
    ]) {
      expect(classes).toContain("inline-flex");
      expect(classes).toContain("focus-visible:ring-2");

      for (const fragment of CUSTOM_CHROME_FRAGMENTS) {
        expect(classes).not.toContain(fragment);
      }
    }
  });

  it("keeps caller classes untouched", () => {
    const classes = buttonVariants({
      className: "w-full rounded-md border px-3 py-2",
      size: "lg",
      variant: "outline",
    });

    expect(classes).toContain("w-full");
    expect(classes).toContain("rounded-md");
    expect(classes).toContain("border");
    expect(classes).toContain("px-3");
    expect(classes).toContain("py-2");
  });

  it("renders the default button with the restrained solid style on the DOM node", () => {
    render(<Button type="button">上传资源</Button>);

    const button = screen.getByRole("button", { name: "上传资源" });

    expect(button).toHaveAttribute("data-slot", "button");
    expect(button).toHaveAttribute("data-variant", "default");
    expect(button).toHaveAttribute("data-size", "default");
    expect(button.className).toContain("inline-flex");
    expect(button.className).toContain("bg-foreground");
    expect(button.className).toContain("text-background");
    expect(button.className).toContain("rounded-xl");

    for (const fragment of CUSTOM_CHROME_FRAGMENTS) {
      expect(button.className).not.toContain(fragment);
    }
  });

  it("passes explicit caller classes through to the DOM node", () => {
    render(
      <Button
        className="w-full rounded-md border px-3 py-2"
        size="sm"
        type="button"
        variant="ghost"
      >
        打开聊天
      </Button>,
    );

    const button = screen.getByRole("button", { name: "打开聊天" });

    expect(button.className).toContain("w-full");
    expect(button.className).toContain("rounded-md");
    expect(button.className).toContain("border");
    expect(button.className).toContain("px-3");
    expect(button.className).toContain("py-2");
    expect(button.className).toContain("inline-flex");
    expect(button.className).toContain("bg-transparent");

    for (const fragment of CUSTOM_CHROME_FRAGMENTS) {
      expect(button.className).not.toContain(fragment);
    }
  });
});
