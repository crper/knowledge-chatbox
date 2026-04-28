/**
 * @file 提示基础 UI 组件模块。
 */

import * as React from "react";
import { Tooltip as TooltipPrimitive } from "@base-ui/react/tooltip";

import { cn } from "@/lib/utils";

function TooltipProvider({
  delay = 0,
  ...props
}: React.ComponentProps<typeof TooltipPrimitive.Provider>) {
  return <TooltipPrimitive.Provider data-slot="tooltip-provider" delay={delay} {...props} />;
}

function Tooltip({ ...props }: React.ComponentProps<typeof TooltipPrimitive.Root>) {
  return <TooltipPrimitive.Root data-slot="tooltip" {...props} />;
}

function TooltipTrigger({ ...props }: React.ComponentProps<typeof TooltipPrimitive.Trigger>) {
  return <TooltipPrimitive.Trigger data-slot="tooltip-trigger" {...props} />;
}

const TOOLTIP_CONTENT_CLASS =
  "relative z-[70] inline-flex w-fit max-w-xs origin-[var(--transform-origin)] items-center gap-1.5 rounded-md bg-foreground px-3 py-1.5 font-sans text-xs leading-none tracking-normal text-background has-data-[slot=kbd]:pr-1.5 transition-[opacity,transform] duration-100 data-[ending-style]:scale-95 data-[ending-style]:opacity-0 data-[starting-style]:scale-95 data-[starting-style]:opacity-0 **:data-[slot=kbd]:relative **:data-[slot=kbd]:isolate **:data-[slot=kbd]:z-[70] **:data-[slot=kbd]:rounded-sm";

type TooltipContentProps = React.ComponentProps<typeof TooltipPrimitive.Positioner>;

function TooltipContent({
  className,
  sideOffset = 0,
  positionMethod = "fixed",
  children,
  ...props
}: TooltipContentProps) {
  return (
    <TooltipPrimitive.Portal>
      <TooltipPrimitive.Positioner
        className="z-[70]"
        positionMethod={positionMethod}
        sideOffset={sideOffset}
        {...props}
      >
        <TooltipPrimitive.Popup
          data-slot="tooltip-content"
          className={cn(TOOLTIP_CONTENT_CLASS, className)}
        >
          {children}
          <TooltipPrimitive.Arrow className="pointer-events-none absolute z-[70] size-2.5 rotate-45 rounded-[2px] bg-foreground data-[side=top]:bottom-0 data-[side=top]:left-1/2 data-[side=top]:-translate-x-1/2 data-[side=top]:translate-y-1/2 data-[side=bottom]:top-0 data-[side=bottom]:left-1/2 data-[side=bottom]:-translate-x-1/2 data-[side=bottom]:-translate-y-1/2 data-[side=left]:top-1/2 data-[side=left]:right-0 data-[side=left]:-translate-y-1/2 data-[side=left]:translate-x-1/2 data-[side=right]:top-1/2 data-[side=right]:left-0 data-[side=right]:-translate-x-1/2 data-[side=right]:-translate-y-1/2" />
        </TooltipPrimitive.Popup>
      </TooltipPrimitive.Positioner>
    </TooltipPrimitive.Portal>
  );
}

export { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger, TOOLTIP_CONTENT_CLASS };
