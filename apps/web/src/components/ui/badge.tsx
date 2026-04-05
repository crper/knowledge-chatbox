/**
 * @file 徽标基础 UI 组件模块。
 */

import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

/**
 * 定义徽标样式变体。
 */
const badgeVariants = cva(
  "group/badge inline-flex h-5 w-fit shrink-0 select-none items-center justify-center gap-1 overflow-hidden rounded-4xl border px-2 py-0.5 text-xs font-medium whitespace-nowrap transition-[background-color,border-color,color,box-shadow] focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 has-data-[icon=inline-end]:pr-1.5 has-data-[icon=inline-start]:pl-1.5 aria-invalid:border-destructive aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 [&>svg]:pointer-events-none [&>svg]:size-3!",
  {
    variants: {
      variant: {
        default:
          "border-primary/20 bg-primary/10 text-primary shadow-[inset_0_1px_0_hsl(var(--surface-highlight)/0.18)] [a]:hover:bg-primary/14",
        secondary:
          "border-border/64 bg-secondary/68 text-secondary-foreground shadow-[inset_0_1px_0_hsl(var(--surface-highlight)/0.14)] [a]:hover:bg-secondary/78",
        destructive:
          "border-destructive/18 bg-destructive/10 text-destructive focus-visible:ring-destructive/20 dark:bg-destructive/16 dark:focus-visible:ring-destructive/40 [a]:hover:bg-destructive/18",
        outline:
          "border-border/72 bg-background/40 text-foreground shadow-[inset_0_1px_0_hsl(var(--surface-highlight)/0.12)] [a]:hover:bg-accent/42 [a]:hover:text-foreground",
        ghost: "border-transparent hover:bg-accent/52 hover:text-foreground",
        link: "text-primary underline-offset-4 hover:underline",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  },
);

/**
 * 定义徽标。
 */
function Badge({
  className,
  variant = "default",
  ...props
}: React.ComponentProps<"span"> & VariantProps<typeof badgeVariants>) {
  return (
    <span
      data-slot="badge"
      data-variant={variant}
      className={cn(badgeVariants({ variant }), className)}
      {...props}
    />
  );
}

export { Badge, badgeVariants };
