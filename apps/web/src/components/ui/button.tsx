/**
 * @file 按钮基础 UI 组件模块。
 */

import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { Slot } from "radix-ui";

import { cn } from "@/lib/utils";

/**
 * 定义按钮样式变体。
 */
const buttonVariants = cva(
  "group/button inline-flex shrink-0 items-center justify-center rounded-xl border bg-clip-padding text-[0.9rem] leading-none font-medium whitespace-nowrap transition-[background-color,border-color,color,box-shadow,transform] outline-none select-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 active:translate-y-px disabled:cursor-not-allowed disabled:pointer-events-none disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/20 dark:aria-invalid:border-destructive/50 dark:aria-invalid:ring-destructive/40 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
  {
    variants: {
      variant: {
        default:
          "border-primary/18 bg-primary/94 text-primary-foreground shadow-[0_12px_28px_-18px_hsl(var(--primary)/0.48)] hover:bg-primary/88 hover:text-primary-foreground active:bg-primary/82 active:text-primary-foreground disabled:text-primary-foreground [a]:text-primary-foreground [a]:hover:text-primary-foreground",
        outline:
          "border-border/56 bg-background/28 text-foreground shadow-[0_10px_26px_-22px_hsl(var(--shadow-color)/0.24)] backdrop-blur-md hover:bg-accent/36 hover:text-foreground aria-expanded:bg-accent/36 aria-expanded:text-foreground",
        secondary:
          "border-border/48 bg-secondary/34 text-secondary-foreground shadow-[0_10px_24px_-22px_hsl(var(--shadow-color)/0.18)] backdrop-blur-md hover:bg-secondary/44 aria-expanded:bg-secondary/44 aria-expanded:text-secondary-foreground",
        ghost:
          "border-transparent text-foreground/78 hover:bg-accent/56 hover:text-foreground aria-expanded:bg-accent/56 aria-expanded:text-foreground",
        destructive:
          "border-destructive/20 bg-destructive/12 text-destructive shadow-[0_10px_24px_-22px_hsl(var(--destructive)/0.22)] backdrop-blur-md hover:bg-destructive/16 focus-visible:border-destructive/40 focus-visible:ring-destructive/20 dark:hover:bg-destructive/22 dark:focus-visible:ring-destructive/40",
        link: "text-primary underline-offset-4 hover:underline",
      },
      size: {
        default:
          "h-11 gap-1.5 px-3 text-[0.9rem] md:h-8 md:px-2.5 md:text-sm has-data-[icon=inline-end]:pr-2 has-data-[icon=inline-start]:pl-2",
        xs: "h-8 gap-1 rounded-[min(var(--radius-md),10px)] px-2 text-[0.75rem] tracking-[0.012em] md:h-6 in-data-[slot=button-group]:rounded-lg has-data-[icon=inline-end]:pr-1.5 has-data-[icon=inline-start]:pl-1.5 [&_svg:not([class*='size-'])]:size-3",
        sm: "h-11 gap-1 rounded-[min(var(--radius-md),12px)] px-3 text-[0.82rem] tracking-[0.01em] md:h-7 md:px-2.5 md:text-[0.8rem] in-data-[slot=button-group]:rounded-lg has-data-[icon=inline-end]:pr-1.5 has-data-[icon=inline-start]:pl-1.5 [&_svg:not([class*='size-'])]:size-3.5",
        lg: "h-11 gap-1.5 px-4 text-[0.95rem] md:h-9 md:px-2.5 md:text-[0.9rem] has-data-[icon=inline-end]:pr-3 has-data-[icon=inline-start]:pl-3",
        icon: "size-11 md:size-8",
        "icon-xs":
          "size-8 rounded-[min(var(--radius-md),10px)] md:size-6 in-data-[slot=button-group]:rounded-lg [&_svg:not([class*='size-'])]:size-3",
        "icon-sm":
          "size-11 rounded-[min(var(--radius-md),12px)] md:size-7 in-data-[slot=button-group]:rounded-lg",
        "icon-lg": "size-12 md:size-9",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  },
);

/**
 * 定义按钮。
 */
function Button({
  className,
  variant = "default",
  size = "default",
  asChild = false,
  ...props
}: React.ComponentProps<"button"> &
  VariantProps<typeof buttonVariants> & {
    asChild?: boolean;
  }) {
  const Comp = asChild ? Slot.Root : "button";

  return (
    <Comp
      data-slot="button"
      data-variant={variant}
      data-size={size}
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    />
  );
}

export { Button, buttonVariants };
