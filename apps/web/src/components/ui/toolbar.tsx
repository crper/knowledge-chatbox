/**
 * @file Toolbar 基础 UI 组件模块。
 */

"use client";

import * as React from "react";
import { Toolbar as ToolbarPrimitive } from "@base-ui/react/toolbar";

import { cn } from "@/lib/utils";

function Toolbar({ className, ...props }: React.ComponentProps<typeof ToolbarPrimitive.Root>) {
  return (
    <ToolbarPrimitive.Root
      className={cn(
        "flex w-full flex-wrap items-center gap-2 rounded-2xl border border-border/60 bg-background/88 p-2",
        className,
      )}
      {...props}
    />
  );
}

function ToolbarGroup({
  className,
  ...props
}: React.ComponentProps<typeof ToolbarPrimitive.Group>) {
  return <ToolbarPrimitive.Group className={cn("flex items-center gap-2", className)} {...props} />;
}

function ToolbarButton({
  className,
  ...props
}: React.ComponentProps<typeof ToolbarPrimitive.Button>) {
  return <ToolbarPrimitive.Button className={cn(className)} {...props} />;
}

function ToolbarLink({ className, ...props }: React.ComponentProps<typeof ToolbarPrimitive.Link>) {
  return <ToolbarPrimitive.Link className={cn(className)} {...props} />;
}

function ToolbarSeparator({
  className,
  ...props
}: React.ComponentProps<typeof ToolbarPrimitive.Separator>) {
  return (
    <ToolbarPrimitive.Separator
      className={cn("mx-1 h-5 w-px shrink-0 bg-border/70", className)}
      {...props}
    />
  );
}

export { Toolbar, ToolbarGroup, ToolbarButton, ToolbarLink, ToolbarSeparator };
