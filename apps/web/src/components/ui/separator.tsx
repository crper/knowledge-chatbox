/**
 * @file Separator基础 UI 组件模块。
 */

import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { Separator as SeparatorPrimitive } from "@base-ui/react/separator";

import { cn } from "@/lib/utils";

const separatorVariants = cva("shrink-0 bg-border", {
  variants: {
    orientation: {
      horizontal: "h-px w-full",
      vertical: "w-px self-stretch",
    },
  },
  defaultVariants: {
    orientation: "horizontal",
  },
});

function Separator({
  className,
  orientation = "horizontal",
  ...props
}: React.ComponentProps<typeof SeparatorPrimitive> & VariantProps<typeof separatorVariants>) {
  return (
    <SeparatorPrimitive
      data-slot="separator"
      orientation={orientation}
      className={cn(separatorVariants({ orientation }), className)}
      {...props}
    />
  );
}

export { Separator, separatorVariants };
