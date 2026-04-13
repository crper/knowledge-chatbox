/**
 * @file Popover 基础 UI 组件模块。
 */

import * as React from "react";
import { Popover as PopoverPrimitive } from "@base-ui/react/popover";

import { cn } from "@/lib/utils";

function Popover({ ...props }: React.ComponentProps<typeof PopoverPrimitive.Root>) {
  return <PopoverPrimitive.Root data-slot="popover" {...props} />;
}

function PopoverTrigger({ ...props }: React.ComponentProps<typeof PopoverPrimitive.Trigger>) {
  return <PopoverPrimitive.Trigger data-slot="popover-trigger" {...props} />;
}

function PopoverContent({
  align = "center",
  className,
  children,
  sideOffset = 8,
  ...props
}: React.ComponentProps<typeof PopoverPrimitive.Positioner>) {
  return (
    <PopoverPrimitive.Portal>
      <PopoverPrimitive.Positioner align={align} sideOffset={sideOffset} {...props}>
        <PopoverPrimitive.Popup
          className={cn(
            "surface-floating z-50 w-[min(22rem,calc(100vw-2rem))] rounded-2xl p-4 text-popover-foreground shadow-lg transition-[opacity,transform] duration-150 data-[ending-style]:scale-95 data-[ending-style]:opacity-0 data-[starting-style]:scale-95 data-[starting-style]:opacity-0",
            className,
          )}
        >
          {children}
        </PopoverPrimitive.Popup>
      </PopoverPrimitive.Positioner>
    </PopoverPrimitive.Portal>
  );
}

function PopoverTitle({
  className,
  ...props
}: React.ComponentProps<typeof PopoverPrimitive.Title>) {
  return (
    <PopoverPrimitive.Title
      className={cn("text-sm font-semibold tracking-tight text-foreground", className)}
      {...props}
    />
  );
}

function PopoverDescription({
  className,
  ...props
}: React.ComponentProps<typeof PopoverPrimitive.Description>) {
  return (
    <PopoverPrimitive.Description
      className={cn("text-sm leading-relaxed text-muted-foreground", className)}
      {...props}
    />
  );
}

export { Popover, PopoverTrigger, PopoverContent, PopoverTitle, PopoverDescription };
