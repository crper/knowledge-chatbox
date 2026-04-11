/**
 * @file ScrollArea基础 UI 组件模块。
 */

import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { ScrollArea as ScrollAreaPrimitive } from "@base-ui/react/scroll-area";

import { cn } from "@/lib/utils";

type ScrollAreaProps = React.ComponentProps<typeof ScrollAreaPrimitive.Root> & {
  contentClassName?: string;
  contentStyle?: React.CSSProperties;
  hideScrollbar?: boolean;
  viewportClassName?: string;
  viewportStyle?: React.CSSProperties;
};

const scrollAreaVariants = cva("relative");

function ScrollArea({
  className,
  contentClassName,
  contentStyle,
  children,
  hideScrollbar = false,
  viewportClassName,
  viewportStyle,
  ...props
}: ScrollAreaProps) {
  return (
    <ScrollAreaPrimitive.Root
      data-slot="scroll-area"
      className={cn(scrollAreaVariants(), className)}
      {...props}
    >
      <ScrollAreaPrimitive.Viewport
        data-slot="scroll-area-viewport"
        className={cn(
          "size-full rounded-[inherit] transition-[color,box-shadow] outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-1",
          viewportClassName,
        )}
        style={viewportStyle}
      >
        <ScrollAreaPrimitive.Content className={contentClassName} style={contentStyle}>
          {children}
        </ScrollAreaPrimitive.Content>
      </ScrollAreaPrimitive.Viewport>
      {hideScrollbar ? null : <ScrollBar />}
      <ScrollAreaPrimitive.Corner />
    </ScrollAreaPrimitive.Root>
  );
}

const scrollBarVariants = cva("flex touch-none p-px transition-colors select-none", {
  variants: {
    orientation: {
      horizontal: "h-2.5 flex-col border-t border-t-transparent",
      vertical: "h-full w-2.5 border-l border-l-transparent",
    },
  },
  defaultVariants: {
    orientation: "vertical",
  },
});

function ScrollBar({
  className,
  orientation = "vertical",
  ...props
}: React.ComponentProps<typeof ScrollAreaPrimitive.Scrollbar> &
  VariantProps<typeof scrollBarVariants>) {
  return (
    <ScrollAreaPrimitive.Scrollbar
      data-slot="scroll-area-scrollbar"
      data-orientation={orientation}
      orientation={orientation}
      className={cn(scrollBarVariants({ orientation }), className)}
      {...props}
    >
      <ScrollAreaPrimitive.Thumb
        data-slot="scroll-area-thumb"
        className="relative flex-1 rounded-full bg-border"
      />
    </ScrollAreaPrimitive.Scrollbar>
  );
}

export { ScrollArea, ScrollBar, scrollAreaVariants, scrollBarVariants };
