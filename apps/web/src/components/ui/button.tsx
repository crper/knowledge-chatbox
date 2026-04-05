/**
 * @file 按钮基础 UI 组件模块。
 */

import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { Button as ButtonPrimitive } from "@base-ui/react/button";

/**
 * 定义按钮样式变体。
 */
const buttonVariants = cva(
  "inline-flex shrink-0 items-center justify-center gap-2 rounded-xl border text-sm font-medium whitespace-nowrap transition-[background-color,border-color,color] duration-150 outline-none select-none focus-visible:ring-2 focus-visible:ring-ring/45 focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:pointer-events-none disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-2 aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
  {
    variants: {
      variant: {
        default: "border-transparent bg-foreground text-background hover:bg-foreground/90",
        outline:
          "border-border bg-background text-foreground hover:bg-accent hover:text-foreground",
        secondary:
          "border-transparent bg-secondary text-secondary-foreground hover:bg-secondary/80",
        ghost:
          "border-transparent bg-transparent text-muted-foreground hover:bg-accent hover:text-foreground",
        destructive: "border-transparent bg-destructive text-white hover:bg-destructive/90",
        link: "rounded-none border-transparent bg-transparent text-primary underline-offset-4 hover:underline",
      },
      size: {
        default:
          "h-11 px-4 text-ui-body md:h-9 md:px-3.5 md:text-ui-body data-[variant=link]:h-auto data-[variant=link]:px-0 data-[variant=link]:py-0",
        xs: "h-8 px-2.5 text-ui-caption md:h-7 md:px-2 data-[variant=link]:h-auto data-[variant=link]:px-0 data-[variant=link]:py-0",
        sm: "h-10 px-3 text-ui-subtle md:h-8 md:px-2.5 md:text-ui-subtle data-[variant=link]:h-auto data-[variant=link]:px-0 data-[variant=link]:py-0",
        lg: "h-12 px-5 text-ui-title md:h-10 md:px-4 md:text-ui-body data-[variant=link]:h-auto data-[variant=link]:px-0 data-[variant=link]:py-0",
        icon: "size-11 md:size-9",
        "icon-xs": "size-8 md:size-7 [&_svg:not([class*='size-'])]:size-3",
        "icon-sm": "size-10 md:size-8",
        "icon-lg": "size-12 md:size-10",
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
  ...props
}: React.ComponentProps<typeof ButtonPrimitive> & VariantProps<typeof buttonVariants>) {
  return (
    <ButtonPrimitive
      data-slot="button"
      data-variant={variant}
      data-size={size}
      className={buttonVariants({ variant, size, className })}
      {...props}
    />
  );
}

export { Button, buttonVariants };
